import type { CodeEditorHandle, InterpreterError } from "../components/codeEditor.tsx";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./modeling.css";

import TopBar from "../components/TopBar";
import arrowIcon14px from "../assets/icons/arrow-14px.svg";
import PlayIcon20px from "../assets/icons/play-20px.svg";
import PlusIcon14px from "../assets/icons/plus-14px.svg";
import CloseIcon20px from "../assets/icons/close-20px.svg";
import DownloadIcon20px from "../assets/icons/download-20px.svg";
import CopyIcon20px from "../assets/icons/copy-20px.svg";

import Graph, { lineColor } from "../components/Graph.tsx";
import ExportMenu from "../components/ExportMenu";
import { runCsv } from "../lib/csv";
import { chartImage, chartPng } from "../lib/chartImage";
import MediaTile, { DEFAULT_POINT_STEP, pointSeries } from "../components/MediaTile.tsx";
import type { MediaItem } from "../components/MediaTile.tsx";
import { deleteMediaFile, loadMediaFile, mediaKey, saveMediaFile } from "../lib/mediaStore";
import { realPoints } from "../lib/calibration";
import { formatTick } from "../components/lineChart.tsx";
import type { ChartPoint } from "../components/lineChart.tsx";
import { newGraph, normalizeWork, toLines } from "../data/Projects.tsx";
import { useProjects } from "../lib/useProjects";
import { assignmentFileContents } from "../lib/assignmentFile";
import { downloadFile, fileNameFor } from "../lib/download";
import ConfirmButton from "../components/ConfirmButton";
import type { GraphConfig, MediaCategory, Project, ProjectWork, SavedMedia, YLine } from "../data/Projects.tsx";
import { openWork, useWorkSync } from "../lib/workSync";
import type { OpenedWork, SaveStatus, Submission } from "../lib/workSync";
import { api, errorOf } from "../lib/api";
import type { Result } from "../lib/api";
import HandInDialog from "../components/HandInDialog";
import Markdown from "../components/Markdown";
import { deleteServerMedia, mediaOnServer, mediaUrl, projectMediaUrl, uploadMedia, urlExists } from "../lib/mediaServer";
import { authErrorKey } from "../lib/authErrors";
import CodeEditor from "../components/codeEditor.tsx";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth";
import { dueDate, usePublished } from "../lib/usePublished";
import type { Publication } from "../lib/usePublished";
import { formatDueDate } from "../lib/formatDueDate";
import PublishDialog from "../components/PublishDialog";
import ErrorBoundary, { NotFound } from "../components/ErrorBoundary";
import { LoadingScreen } from "../components/RouteGuards";
import { useSimulation } from "../lib/simulation";
import { column, valueAt } from "../lib/samples";
import type { SampleTable } from "../lib/samples";
import { describeError } from "../lib/interpreterErrors";

// Start values run once; model rules run every step. The comments are in the interface's language.
const defaultStart = (comment: string, seconds: string) => `// ${comment}\nt = 0\ndt = 0.01 // ${seconds}\n`;
const DEFAULT_MODEL = "stop als t >= 10\n";

const DEFAULT_STEPS = 100_000;
const MAX_STEPS = 1_000_000;

// Variables the code assigns (`name = ...`), in the order they first appear
function codeVariables(source: string): string[] {
    const names = new Set<string>();
    for (const line of source.split("\n")) {
        const match = line.replace(/\/\/.*$/, "").match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/);
        if (match) names.add(match[1]);
    }
    return [...names];
}

// How the last run ended, for the line under the code
type RunStatus = { kind: "stopped" | "limit" | "error"; steps: number; t: number | undefined };

const MIN_PANEL_WIDTH_PERCENT = 15;
const MIN_ROW_HEIGHT_PERCENT = 15;

// Moves the divider after panel `index` by `delta` percent, keeping both panels next to it at least `min`
function resizePair<T extends number[]>(sizes: T, index: number, delta: number, min: number): T {
    const total = sizes[index] + sizes[index + 1];
    const first = Math.min(Math.max(sizes[index] + delta, min), total - min);
    const next = [...sizes] as T;
    next[index] = first;
    next[index + 1] = total - first;
    return next;
}

// Dividers move with the arrow keys along their direction, 2% at a time; Home and End move them all the way
const DIVIDER_KEY_STEP = 2;
function dividerKeyDelta(key: string, orientation: "vertical" | "horizontal"): number | null {
    const [back, forward] = orientation === "vertical" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
    if (key === back) return -DIVIDER_KEY_STEP;
    if (key === forward) return DIVIDER_KEY_STEP;
    if (key === "Home") return -100;
    if (key === "End") return 100;
    return null;
}

type DragState = {
    dividerIndex: number;
    startX: number;
    startWidths: [number, number, number];
};

type RowDragState = {
    dividerIndex: number;
    startY: number;
    startHeights: number[];
};

type AnalysisRow = { kind: "graph"; graph: GraphConfig } | { kind: "media"; item: MediaItem };

// Graphs and media share the right-hand column
const MAX_PANELS = 3;

const ACCEPT_BY_CATEGORY: Record<MediaCategory, string> = {
    photo: "image/*",
    video: "video/*",
    animation: "image/gif,video/mp4,video/webm",
    document: ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function inferMediaCategory(file: File): MediaCategory {
    if (file.type === "image/gif") return "animation";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("image/")) return "photo";
    return "document";
}

const ALL_MEDIA_ACCEPT = Object.values(ACCEPT_BY_CATEGORY).join(",");

const toSaved = (items: MediaItem[]): SavedMedia[] => items.map(({ url: _url, ...saved }) => saved);

// First free name like video1, video2, photo1 for a new media's point variables
function nextVarName(category: MediaCategory, items: SavedMedia[]) {
    const taken = new Set(items.map((item) => item.varName));
    let n = 1;
    while (taken.has(`${category}${n}`)) n++;
    return `${category}${n}`;
}

// The media a project gives every student to start with; its files stay the project's
function starterMedia(project: Project | undefined): SavedMedia[] {
    const items: SavedMedia[] = [];
    for (const m of project?.media ?? []) {
        items.push({
            id: m.id,
            name: m.name,
            mime: m.mime,
            category: m.category,
            varName: nextVarName(m.category, items),
            step: DEFAULT_POINT_STEP,
            points: [],
            graphX: m.category === "photo" ? "x" : "t",
            graphYs: [{ name: "y", color: 0 }],
            source: "project",
        });
    }
    return items;
}

const NO_WORK: OpenedWork = { work: null, submission: null, version: 0, unsynced: false, offline: false, conflictWith: null };

// The assignment comes from the address (/modeling/<id>), so it can be linked, bookmarked and opened in a
// new tab; /modeling alone is an empty workspace. Work is saved per account, so the workspace only opens
// once it's known who is signed in and their work has loaded; a different account gets a fresh workspace.
function Modeling() {
    const { projectId } = useParams();
    const { user } = useAuth();
    const { projects, byId } = useProjects();
    // Only assignments this account may open are loaded, so anything else isn't found
    const project = byId(projectId);
    // The loaded work and the assignment it belongs to: switching assignments never opens one with another's work
    const [opened, setOpened] = useState<{ projectId: string | null; work: OpenedWork } | null>(null);
    // Bumped to load the work again, e.g. after choosing another device's version
    const [reloads, setReloads] = useState(0);
    // Only another account reopens the work. The same person signing in again after their session
    // ended keeps the open workspace, which then sends what couldn't be saved (reopening at that
    // moment would race with that save and look like a conflict).
    const userId = user?.id ?? null;
    // Likewise renaming the assignment (a new project object with the same id) doesn't reopen it
    const openId = project?.id ?? null;
    const projectsLoaded = projects !== null;

    useEffect(() => {
        if (userId === null || !projectsLoaded) return;
        if (openId === null) return setOpened({ projectId: null, work: NO_WORK });
        let cancelled = false;
        setOpened(null);
        openWork(openId).then((work) => {
            if (!cancelled) setOpened({ projectId: openId, work });
        });
        return () => {
            cancelled = true;
        };
    }, [userId, projectsLoaded, openId, reloads]);

    if (!user || projects === null) return <LoadingScreen/>;
    if (projectId !== undefined && !project) {
        return <NotFound title="modeling.notFoundTitle" description="modeling.notFoundDescription"/>;
    }
    if (!opened || opened.projectId !== (project?.id ?? null)) return <LoadingScreen/>;
    return (
        <ModelingWorkspace
            key={`${user.id}-${opened.projectId}-${reloads}`}
            project={project}
            opened={opened.work}
            onReload={() => setReloads((n) => n + 1)}
        />
    );
}

// A teacher looking at a student's work: read-only, either the handed-in copy or the current work
interface Review {
    classId: number;
    studentId: number;
    studentName: string;
    submittedAt: number | null;
    showing: "submission" | "work";
    hasWork: boolean;
    onShow: (which: "submission" | "work") => void;
}

// A teacher's read-only view of a student's work on a project published to their class
export function ReviewWork() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const params = useParams();
    const classId = Number(params.classId);
    const studentId = Number(params.userId);
    const { projects, byId } = useProjects();
    const project = byId(params.projectId);
    const [data, setData] = useState<{ student: { name: string }; work: unknown; submission: { work: unknown; submittedAt: number } | null } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showing, setShowing] = useState<"submission" | "work">("submission");

    useEffect(() => {
        if (user?.role !== "teacher" || !project) return;
        api<{ student: { name: string }; work: unknown; submission: { work: unknown; submittedAt: number } | null }>(
            `/classes/${classId}/students/${studentId}/work/${project.id}`
        ).then(({ ok, data }) => {
            if (!ok || !data.student) return setError(errorOf(data));
            setData({ student: data.student, work: data.work ?? null, submission: data.submission ?? null });
            setShowing(data.submission ? "submission" : "work");
        });
    }, [user, project, classId, studentId]);

    if (projects === null) return null;
    if (!project || error) {
        return <p className="review-error" role="alert">{t(authErrorKey(error ?? "not_found"))}</p>;
    }
    if (!data) return null;

    const work = normalizeWork(showing === "submission" ? data.submission?.work : data.work);
    return (
        <ModelingWorkspace
            key={showing}
            project={project}
            opened={{ ...NO_WORK, work }}
            onReload={() => undefined}
            review={{
                classId,
                studentId,
                studentName: data.student.name,
                submittedAt: data.submission?.submittedAt ?? null,
                showing,
                hasWork: data.work !== null,
                onShow: setShowing,
            }}
        />
    );
}

// A teacher trying a project the way a student first sees it: nothing is saved
export function PreviewProject() {
    const { projectId } = useParams();
    const { projects, byId } = useProjects();
    const project = byId(projectId);

    if (projects === null || !project) return null;
    return <ModelingWorkspace key={project.id} project={project} opened={NO_WORK} onReload={() => undefined} preview/>;
}

type PanelTab = "explanation" | "code" | "analysis";
const PANEL_TABS: PanelTab[] = ["explanation", "code", "analysis"];

// On narrow screens (modeling.css shows them there): one panel at a time
function PanelTabs({ tab, onChange }: { tab: PanelTab; onChange: (tab: PanelTab) => void }) {
    const { t } = useTranslation();
    const labels: Record<PanelTab, string> = {
        explanation: t("modeling.tabExplanation"),
        code: t("modeling.tabCode"),
        analysis: t("modeling.tabAnalysis"),
    };
    // Arrow keys move between the tabs, as in any tab list
    const onKeyDown = (e: React.KeyboardEvent) => {
        const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = PANEL_TABS[(PANEL_TABS.indexOf(tab) + step + PANEL_TABS.length) % PANEL_TABS.length];
        onChange(next);
        document.getElementById(`tab-${next}`)?.focus();
    };
    return (
        <div className="modeling-tabs" role="tablist" aria-label={t("modeling.panels")} onKeyDown={onKeyDown}>
            {PANEL_TABS.map((name) => (
                <button
                    key={name}
                    type="button"
                    role="tab"
                    id={`tab-${name}`}
                    aria-selected={tab === name}
                    aria-controls={`panel-${name}`}
                    tabIndex={tab === name ? 0 : -1}
                    className={tab === name ? "active" : undefined}
                    onClick={() => onChange(name)}
                >
                    {labels[name]}
                </button>
            ))}
        </div>
    );
}

// For a student: when the assignment is due and what their teacher added for their class
function AssignmentInfo({ publications }: { publications: Publication[] }) {
    const { t, language } = useTranslation();
    const shown = publications.filter((p) => p.dueAt !== null || p.instructions);
    if (shown.length === 0) return null;
    return (
        <div className="assignment-info">
            {shown.map((p) => {
                const overdue = p.dueAt !== null && p.dueAt < Date.now();
                return (
                    <div key={p.id} className="assignment-info-class">
                        {p.dueAt !== null && (
                            <p className={`due-label${overdue ? " overdue" : ""}`}>
                                {t(overdue ? "dashboard.overdue" : "dashboard.due", { time: formatDueDate(p.dueAt, language) })}
                                {publications.length > 1 && ` · ${p.name}`}
                            </p>
                        )}
                        {p.instructions && (
                            <p className="assignment-instructions">
                                <strong>{t("modeling.teacherInstructions")}</strong> {p.instructions}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function ModelingWorkspace({ project, opened, onReload, review, preview = false }: {
    project: Project | undefined;
    opened: OpenedWork;
    onReload: () => void;
    review?: Review;
    preview?: boolean;
}) {
    const navigate = useNavigate();
    const { t, language } = useTranslation();
    const { user } = useAuth();
    const isTeacher = user?.role === "teacher";
    const { published, setProjectClasses } = usePublished();
    const { updateProject, deleteProject } = useProjects();
    // A student's own assignment: they rename and delete it here (teachers use the assignment editor)
    const ownAssignment = !!project?.mine && !isTeacher && !review && !preview;
    const [publishOpen, setPublishOpen] = useState(false);

    // ---------- explanation / code / analysis column widths ----------
    const contentRef = useRef<HTMLDivElement | null>(null);
    const dragState = useRef<DragState | null>(null);
    const [panelWidths, setPanelWidths] = useState<[number, number, number]>([
        100 / 3,
        100 / 3,
        100 / 3,
    ]);
    const [draggingDivider, setDraggingDivider] = useState<number | null>(null);

    const handlePointerMove = useCallback((e: PointerEvent) => {
        const drag = dragState.current;
        const container = contentRef.current;
        if (!drag || !container) return;

        const containerWidth = container.getBoundingClientRect().width;
        const deltaPercent = ((e.clientX - drag.startX) / containerWidth) * 100;
        setPanelWidths(resizePair(drag.startWidths, drag.dividerIndex, deltaPercent, MIN_PANEL_WIDTH_PERCENT));
    }, []);

    const handlePointerUp = useCallback(() => {
        dragState.current = null;
        setDraggingDivider(null);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
    }, [handlePointerMove]);

    const handleDividerPointerDown = useCallback(
        (dividerIndex: number) => (e: React.PointerEvent) => {
            e.preventDefault();
            dragState.current = { dividerIndex, startX: e.clientX, startWidths: panelWidths };
            setDraggingDivider(dividerIndex);
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
            window.addEventListener("pointermove", handlePointerMove);
            window.addEventListener("pointerup", handlePointerUp);
        },
        [panelWidths, handlePointerMove, handlePointerUp]
    );

    // ---------- code panel ----------
    // A project reopens with the code and steps saved for it; an empty project starts fresh
    const savedWork = opened.work;
    // Media the work starts with: what was saved, or for new work the project's starter media
    const [initialMedia] = useState(() => savedWork?.media ?? starterMedia(project));
    // Viewing a student's work or previewing a project: nothing is saved
    const noSaving = !!review || preview;
    // Viewing a student's work saves nothing
    const sync = useWorkSync(noSaving ? null : project?.id ?? null, opened);
    // The handed-in copy of this work, if any (students)
    const [submission, setSubmission] = useState<Submission | null>(opened.submission);
    const [handInOpen, setHandInOpen] = useState(false);
    // Media that couldn't be stored on the server, and why; it's still kept in this browser
    const [mediaError, setMediaError] = useState<{ name: string; error: string } | null>(null);
    // New work starts from the project's starter code
    const [start, setStart] = useState(
        savedWork?.start ?? project?.start ?? defaultStart(t("modeling.defaultStartComment"), t("modeling.defaultSeconds"))
    );
    const [model, setModel] = useState(savedWork?.model ?? project?.model ?? DEFAULT_MODEL);
    const [steps, setSteps] = useState(savedWork?.steps ?? "");
    // A new project starts with one empty graph
    const [graphs, setGraphs] = useState<GraphConfig[]>(() => savedWork?.graphs
        ?? (project?.graphs.length ? project.graphs.map((g) => newGraph(g.x, toLines(g.ys))) : [newGraph()]));
    // Media is loaded from this device after opening; mediaLoaded is false until then
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const mediaLoaded = useRef(!project);
    const startEditorRef = useRef<CodeEditorHandle>(null);
    const modelEditorRef = useRef<CodeEditorHandle>(null);
    // Models run in a worker: a long run can be stopped and doesn't freeze the page
    const simulation = useSimulation();
    const wasm = simulation.state;
    const wasmReady = wasm === "ready";

    // Every change to a project is saved with it and counts as an edit
    function saveWork(changes: Partial<ProjectWork>) {
        if (!project || noSaving) return;
        // Until the media files have loaded, keep the media that was saved before
        const media = mediaLoaded.current ? toSaved(mediaItems) : initialMedia;
        sync.save({ start, model, steps, graphs, media, ...changes });
    }

    // Hands in the work as it is now: the latest changes are saved first, so the teacher sees exactly this
    // The assignment as a file that "Open assignment" on the dashboard can open again
    function exportAssignment() {
        if (!project) return;
        const media = mediaLoaded.current ? toSaved(mediaItems) : initialMedia;
        const contents = assignmentFileContents(project.title, project.explanation, { start, model, steps, graphs, media });
        downloadFile(fileNameFor(project.title, "physicsgo.json"), new Blob([contents], { type: "application/json" }));
    }

    // Every variable of the last run at every step, for a spreadsheet
    function exportRunCsv() {
        if (!history) return;
        const csv = runCsv(history, codeVariables(`${start}\n${model}`), language);
        downloadFile(fileNameFor(`${project?.title ?? "model"} run`, "csv"), new Blob([csv], { type: "text/csv" }));
    }

    // A graph as it's shown now, as a PNG or SVG image with a legend (always in light colours)
    async function exportGraph(graph: GraphConfig, index: number, format: "png" | "svg") {
        const chart = analysisStackRef.current?.querySelector(`[data-graph-id="${graph.id}"] svg.recharts-surface`);
        if (!(chart instanceof SVGSVGElement)) return;
        const image = chartImage(chart, { lines: graph.ys.map((y) => ({ name: y.name, color: lineColor(y.color) })), x: graph.x });
        const name = fileNameFor(`${project?.title ?? "model"} graph ${index + 1}`, format);
        if (format === "svg") downloadFile(name, new Blob([image.svg], { type: "image/svg+xml" }));
        else downloadFile(name, await chartPng(image));
    }

    // What's still waiting is saved first, so nothing is written for the assignment after it's gone
    async function deleteOwnAssignment() {
        if (!project) return;
        await sync.saveNow();
        const res = await deleteProject(project.id);
        if (res.ok) navigate("/dashboard", { replace: true });
        else setMediaError({ name: project.title, error: res.error });
    }

    async function handIn(): Promise<Result> {
        if (!project) return { ok: false, error: "server_error" };
        if (sync.version === 0) saveWork({}); // nothing saved yet: save the starting state
        const { saved, version } = await sync.saveNow();
        if (!saved) return { ok: false, error: "not_saved" };
        const { ok, data } = await api<{ submission: Submission }>(`/work/${project.id}/submit`, "POST", { version });
        if (!ok || !data.submission) return { ok: false, error: errorOf(data) };
        setSubmission(data.submission);
        return { ok: true };
    }

    async function retractHandIn(): Promise<Result> {
        if (!project) return { ok: false, error: "server_error" };
        const { ok, data } = await api(`/work/${project.id}/submission`, "DELETE");
        if (!ok) return { ok: false, error: errorOf(data) };
        setSubmission(null);
        return { ok: true };
    }

    // Changes made in this browser that the server hasn't got yet (offline, or from before work
    // was saved on the server) are sent as soon as the project opens
    useEffect(() => {
        if (opened.unsynced && savedWork) sync.save(savedWork);
    }, []); // only on opening

    // The editors also report values set from outside, so only real changes count as an edit
    function handleStartChange(value: string) {
        if (value === start) return;
        setStart(value);
        saveWork({ start: value });
    }

    function handleModelChange(value: string) {
        if (value === model) return;
        setModel(value);
        saveWork({ model: value });
    }

    function handleStepsChange(value: string) {
        setSteps(value);
        saveWork({ steps: value });
    }

    function setGraphList(next: GraphConfig[]) {
        setGraphs(next);
        saveWork({ graphs: next });
    }

    function updateGraph(id: string, x: string, ys: YLine[]) {
        setGraphList(graphs.map((g) => (g.id === id ? { ...g, x, ys } : g)));
    }

    // An empty field runs the placeholder's number of steps
    function stepCount() {
        const n = Math.floor(Number(steps));
        if (!steps.trim() || !Number.isFinite(n)) return DEFAULT_STEPS;
        return Math.min(MAX_STEPS, Math.max(1, n));
    }

    // Results of the last run (the state after the start values, then after every step);
    // the chart stays empty until the model has run
    const [history, setHistory] = useState<SampleTable | null>(null);
    const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
    const [nonFinite, setNonFinite] = useState<{ name: string; step: number; t: number | undefined } | null>(null);

    // Points plotted on videos, as variables the code can read at the current t
    const measuredData = useMemo(() => mediaItems.flatMap(pointSeries), [mediaItems]);

    // Variables from the code and the measured data, plus any the last run produced that neither shows anymore
    const variables = useMemo(() => {
        const names = codeVariables(`${start}\n${model}`);
        for (const name of [...measuredData.map((s) => s.name), ...(history?.names ?? [])]) {
            if (!names.includes(name)) names.push(name);
        }
        return names;
    }, [start, model, history, measuredData]);

    // The measured points themselves (in calibrated units), drawn as dots with the line of their variable when
    // the graph's X is t or the same video's other coordinate
    const markersFor = useCallback((x: string, y: string): ChartPoint[] => {
        for (const item of mediaItems) {
            if (item.category !== "video") continue;
            const [xName, yName] = [`x_${item.varName}`, `y_${item.varName}`];
            const pick = (axis: string): "t" | "x" | "y" | null =>
                axis === "t" ? "t" : axis === xName ? "x" : axis === yName ? "y" : null;
            const [px, py] = [pick(x), pick(y)];
            if (!px || !py || py === "t") continue;
            return realPoints(item).map((p) => ({ x: px === "t" ? p.t ?? 0 : p[px], y: p[py] }));
        }
        return [];
    }, [mediaItems]);

    async function runSimulation() {
        if (!wasmReady || simulation.running) return;
        startEditorRef.current?.clearErrors();
        modelEditorRef.current?.clearErrors();
        setRunStatus(null);
        setNonFinite(null);

        const result = await simulation.run(start, model, stepCount(), measuredData);
        if (!result) return; // stopped
        const samples = result.samples;
        // A model that steps through something other than time (say, a position) leaves t where it is
        const tEnd = valueAt(samples, "t", samples.length - 1);
        const tStart = valueAt(samples, "t", 0);
        const moved = tEnd !== undefined && tEnd !== (tStart !== undefined && Number.isFinite(tStart) ? tStart : 0);
        const status = { steps: Math.max(0, samples.length - 1), t: moved ? tEnd : undefined };

        if (!result.ok) {
            setRunStatus({ kind: "error", ...status });
            // Each error's line is counted in its own block, which is its own editor
            const inBlock = (block: string): InterpreterError[] => result.errors
                .filter((e) => e.block === block)
                .map((e) => ({ line: e.line, column: e.column, message: describeError(e, t) }));
            startEditorRef.current?.setErrors(inBlock("start"));
            modelEditorRef.current?.setErrors(inBlock("model"));
            return;
        }

        setHistory(samples);
        setRunStatus({ kind: result.stopped ? "stopped" : "limit", ...status });
        const found = result.firstNonFinite;
        setNonFinite(found && { name: found.name, step: found.step, t: column(samples, "t")?.[found.step] });
    }

    // Ctrl+Enter runs the model (⌘+Enter on a Mac)
    const shortcutKeys = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ Enter" : "Ctrl+Enter";

    function describeRun(status: RunStatus) {
        const steps = status.steps.toLocaleString(language);
        if (status.kind === "error") return t("modeling.runError");
        if (status.t === undefined) return t(status.kind === "stopped" ? "modeling.runStoppedNoT" : "modeling.runLimitNoT", { steps });
        return t(status.kind === "stopped" ? "modeling.runStopped" : "modeling.runLimit", { steps, t: formatTick(status.t) });
    }

    function describeNonFinite(found: NonNullable<typeof nonFinite>) {
        const step = found.step.toLocaleString(language);
        return found.t === undefined || !Number.isFinite(found.t)
            ? t("modeling.nonFiniteNoT", { name: found.name, step })
            : t("modeling.nonFinite", { name: found.name, step, t: formatTick(found.t) });
    }

    // ---------- Insert Media & Embeds ----------
    // Media, its points and settings are saved with the project; the files themselves in IndexedDB
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const mediaItemsRef = useRef<MediaItem[]>([]);

    useEffect(() => {
        mediaItemsRef.current = mediaItems;
    }, [mediaItems]);

    // Reopening a project brings back its media: from this browser when it has the file (sending it to
    // the server if that doesn't have it yet), otherwise from the server. A file found in neither keeps its points.
    useEffect(() => {
        if (!project) return;
        let cancelled = false;
        const saved = initialMedia;
        Promise.all(saved.map(async (media): Promise<MediaItem> => {
            if (media.source === "project") {
                const url = projectMediaUrl(project.id, media.id);
                return { ...media, url: (await urlExists(url)) ? url : "" };
            }
            if (review) {
                const onServer = await mediaOnServer(project.id, media.id, review.studentId);
                return { ...media, url: onServer ? mediaUrl(project.id, media.id, review.studentId) : "" };
            }
            const file = await loadMediaFile(mediaKey(project.id, media.id)).catch(() => undefined);
            if (file) {
                mediaOnServer(project.id, media.id).then((onServer) => {
                    if (onServer === false) uploadMedia(project.id, media.id, file);
                });
                return { ...media, url: URL.createObjectURL(file) };
            }
            const onServer = await mediaOnServer(project.id, media.id);
            return { ...media, url: onServer ? mediaUrl(project.id, media.id) : "" };
        })).then((items) => {
            if (cancelled) {
                items.forEach((item) => item.url.startsWith("blob:") && URL.revokeObjectURL(item.url));
                return;
            }
            mediaLoaded.current = true;
            setMediaItems(items);
        });
        return () => {
            cancelled = true;
        };
    }, [project, initialMedia, review?.studentId]);

    // Revoke every blob URL on unmount so nothing leaks.
    useEffect(() => {
        return () => {
            mediaItemsRef.current.forEach((item) => item.url.startsWith("blob:") && URL.revokeObjectURL(item.url));
        };
    }, []);

    const panelCountRef = useRef(0);

    const openFilePicker = useCallback(() => {
        if (panelCountRef.current >= MAX_PANELS || noSaving) return;
        const input = fileInputRef.current;
        if (!input) return;
        input.accept = ALL_MEDIA_ACCEPT;
        input.click();
    }, []);

    // Cmd+O (Mac) / Ctrl+O (Windows/Linux) opens the same picker as the
    // button. preventDefault stops the browser's own "Open File" dialog,
    // which most browsers bind to this combo by default.
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "o") {
                e.preventDefault();
                openFilePicker();
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [openFilePicker]);

    function setMedia(items: MediaItem[]) {
        setMediaItems(items);
        saveWork({ media: toSaved(items) });
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow picking the same file again later

        if (!file || !mediaLoaded.current || panelCount >= MAX_PANELS) return;

        const category = inferMediaCategory(file);
        const newItem: MediaItem = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            category,
            name: file.name,
            url: URL.createObjectURL(file),
            mime: file.type,
            varName: nextVarName(category, mediaItems),
            step: DEFAULT_POINT_STEP,
            points: [],
            graphX: category === "photo" ? "x" : "t",
            graphYs: [{ name: "y", color: 0 }],
        };
        setMedia([...mediaItems, newItem]);
        if (!project) return;
        const projectId = project.id;
        saveMediaFile(mediaKey(projectId, newItem.id), file).catch(() => undefined);
        setMediaError(null);
        uploadMedia(projectId, newItem.id, file).then((res) => {
            // Offline uploads happen the next time the project opens; other failures are shown
            if (!res.ok && res.error !== "network") setMediaError({ name: file.name, error: res.error });
        });
    }

    function updateMediaItem(updated: MediaItem) {
        setMedia(mediaItems.map((item) => (item.id === updated.id ? updated : item)));
    }

    function removeMediaItem(id: string) {
        const target = mediaItems.find((item) => item.id === id);
        if (target?.url.startsWith("blob:")) URL.revokeObjectURL(target.url);
        setMedia(mediaItems.filter((item) => item.id !== id));
        // Starter media stays the project's; only the student's own files are deleted
        if (!project || noSaving || target?.source === "project") return;
        deleteMediaFile(mediaKey(project.id, id)).catch(() => {});
        deleteServerMedia(project.id, id);
    }

    // ---------- analysis panel rows (graphs, then media) ----------
    const rows: AnalysisRow[] = useMemo(
        () => [
            ...graphs.map((graph) => ({ kind: "graph" as const, graph })),
            ...mediaItems.map((item) => ({ kind: "media" as const, item })),
        ],
        [graphs, mediaItems]
    );
    const panelCount = rows.length;
    panelCountRef.current = panelCount;
    const panelsFull = panelCount >= MAX_PANELS;

    // Insert Media & Embeds opens a small menu: a new graph, or a file from this computer
    const [insertMenuOpen, setInsertMenuOpen] = useState(false);
    // Below about 1024px wide the three columns show one at a time (modeling.css)
    const [tab, setTab] = useState<PanelTab>("explanation");
    const insertMenuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!insertMenuOpen) return;
        function handlePointerDown(e: PointerEvent) {
            if (!insertMenuRef.current?.contains(e.target as Node)) setInsertMenuOpen(false);
        }
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setInsertMenuOpen(false);
        }
        window.addEventListener("pointerdown", handlePointerDown);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("pointerdown", handlePointerDown);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [insertMenuOpen]);

    function insertGraph() {
        setInsertMenuOpen(false);
        if (!panelsFull) setGraphList([...graphs, newGraph()]);
    }

    function insertMediaFile() {
        setInsertMenuOpen(false);
        openFilePicker();
    }

    const analysisStackRef = useRef<HTMLDivElement | null>(null);
    const rowDragState = useRef<RowDragState | null>(null);
    const [rowHeights, setRowHeights] = useState<number[]>([100]);
    const [draggingRowDivider, setDraggingRowDivider] = useState<number | null>(null);

    // Re-split the stack evenly whenever a media panel (or the chart) is
    // added or removed.
    useEffect(() => {
        setRowHeights(Array(rows.length).fill(100 / rows.length));
    }, [rows.length]);

    const handleRowPointerMove = useCallback((e: PointerEvent) => {
        const drag = rowDragState.current;
        const container = analysisStackRef.current;
        if (!drag || !container) return;

        const containerHeight = container.getBoundingClientRect().height;
        const deltaPercent = ((e.clientY - drag.startY) / containerHeight) * 100;
        setRowHeights(resizePair(drag.startHeights, drag.dividerIndex, deltaPercent, MIN_ROW_HEIGHT_PERCENT));
    }, []);

    const handleRowPointerUp = useCallback(() => {
        rowDragState.current = null;
        setDraggingRowDivider(null);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handleRowPointerMove);
        window.removeEventListener("pointerup", handleRowPointerUp);
    }, [handleRowPointerMove]);

    const handleRowDividerPointerDown = useCallback(
        (dividerIndex: number) => (e: React.PointerEvent) => {
            e.preventDefault();
            rowDragState.current = { dividerIndex, startY: e.clientY, startHeights: rowHeights };
            setDraggingRowDivider(dividerIndex);
            document.body.style.cursor = "row-resize";
            document.body.style.userSelect = "none";
            window.addEventListener("pointermove", handleRowPointerMove);
            window.addEventListener("pointerup", handleRowPointerUp);
        },
        [rowHeights, handleRowPointerMove, handleRowPointerUp]
    );

    // Dividers are focusable separators that report the size of the panel before them and move with keys
    const dividerProps = (
        orientation: "vertical" | "horizontal",
        sizes: number[],
        index: number,
        min: number,
        onMove: (delta: number) => void,
    ) => ({
        role: "separator",
        tabIndex: 0,
        "aria-orientation": orientation,
        "aria-valuenow": Math.round(sizes[index] ?? 0),
        "aria-valuemin": min,
        "aria-valuemax": Math.round((sizes[index] ?? 0) + (sizes[index + 1] ?? 0) - min),
        onKeyDown: (e: React.KeyboardEvent) => {
            const delta = dividerKeyDelta(e.key, orientation);
            if (delta === null) return;
            e.preventDefault();
            onMove(delta);
        },
    });
    const columnDividerProps = (index: number) => dividerProps("vertical", panelWidths, index, MIN_PANEL_WIDTH_PERCENT,
        (delta) => setPanelWidths((widths) => resizePair(widths, index, delta, MIN_PANEL_WIDTH_PERCENT)));
    const rowDividerProps = (index: number) => dividerProps("horizontal", rowHeights, index, MIN_ROW_HEIGHT_PERCENT,
        (delta) => setRowHeights((heights) => resizePair(heights, index, delta, MIN_ROW_HEIGHT_PERCENT)));

    return (
        <div className="modeling-page">
            <TopBar
                crumbs={[
                    ...(review ? [{ label: t("nav.classes"), to: "/classes", state: { classId: review.classId } }] : []),
                    {
                        label: ownAssignment && project
                            ? <TitleField title={project.title} onSave={(title) => updateProject(project.id, { title })}/>
                            : project?.title ?? "",
                    },
                ]}
                after={project && !noSaving && <SaveIndicator status={sync.status}/>}
            >
                    {review ? (
                        <ReviewBar review={review}/>
                    ) : preview ? (
                        <div className="review-bar">
                            <span className="review-student">{t("preview.notice")}</span>
                            <button type="button" className="review-back" onClick={() => navigate(-1)}>{t("preview.close")}</button>
                        </div>
                    ) : (
                        <>
                        <div className="insert-menu-anchor" ref={insertMenuRef}>
                            <button
                                type="button"
                                className="insert-media-btn"
                                onClick={() => setInsertMenuOpen(!insertMenuOpen)}
                                disabled={panelsFull}
                                title={panelsFull ? t("modeling.removePanelTooltip") : undefined}
                                aria-haspopup="menu"
                                aria-expanded={insertMenuOpen}
                            >
                                <img src={PlusIcon14px} alt=""/>
                                <p>{t("modeling.insertMediaEmbeds")}</p>
                            </button>
                            {insertMenuOpen && (
                                <div className="insert-menu" role="menu">
                                    <button type="button" role="menuitem" autoFocus onClick={insertGraph}>
                                        {t("modeling.insertGraph")}
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={insertMediaFile}
                                        aria-keyshortcuts="Meta+O Control+O"
                                    >
                                        {t("modeling.insertMediaFile")}
                                        <span className="insert-menu-shortcut">⌘O</span>
                                    </button>
                                </div>
                            )}
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileChange}
                            style={{ display: "none" }}
                        />
                        {/* Teachers publish projects to their classes; students hand them in */}
                        {project && (
                            <button type="button" className="nav-icon-btn" onClick={exportAssignment}
                                    aria-label={t("modeling.export")} title={t("modeling.exportHint")}>
                                <img src={DownloadIcon20px} alt=""/>
                            </button>
                        )}
                        {ownAssignment && (
                            <ConfirmButton className="insert-media-btn delete-own" label={t("modeling.deleteOwn")} onConfirm={deleteOwnAssignment}/>
                        )}
                        {isTeacher && project && (project.mine ? (
                            <button className="insert-media-btn" onClick={() => navigate(`/projects/${project.id}/edit`)}>
                                <p>{t("projectEditor.edit")}</p>
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="nav-icon-btn"
                                onClick={() => navigate("/projects/new", { state: { copyOf: project.id } })}
                                aria-label={t("projectEditor.duplicate")}
                                title={t("projectEditor.duplicateHint")}
                            >
                                <img src={CopyIcon20px} alt=""/>
                            </button>
                        ))}
                        {isTeacher && project && (
                            <button className="insert-media-btn" onClick={() => navigate(`/projects/${project.id}/preview`)}>
                                <p>{t("preview.button")}</p>
                            </button>
                        )}
                        {isTeacher ? (
                            project && (
                                <button className="hand-in-btn" onClick={() => setPublishOpen(true)}>
                                    <img src={arrowIcon14px} alt=""/>
                                    <p>{t("publish.button")}</p>
                                </button>
                            )
                        ) : (
                            // Only projects that are an assignment in one of the student's classes can be handed in
                            project && (published[project.id]?.length ?? 0) > 0 && (
                                <>
                                    {submission && (
                                        <span className="hand-in-chip">
                                            {t(sync.version > submission.workVersion ? "handIn.chipChanged" : "handIn.handedInAt", {
                                                time: new Date(submission.submittedAt).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" }),
                                            })}
                                            {(dueDate(published[project.id]) ?? Infinity) < submission.submittedAt && ` · ${t("dashboard.late")}`}
                                        </span>
                                    )}
                                    <button className="hand-in-btn" onClick={() => setHandInOpen(true)}>
                                        <img src={arrowIcon14px} alt=""/>
                                        <p>{submission ? t("modeling.handInAgain") : t("modeling.handInAssignment")}</p>
                                    </button>
                                </>
                            )
                        )}
                        {handInOpen && project && (
                            <HandInDialog
                                title={project.title}
                                submission={submission}
                                changedSince={!!submission && sync.version > submission.workVersion}
                                onHandIn={handIn}
                                onRetract={retractHandIn}
                                onClose={() => setHandInOpen(false)}
                            />
                        )}
                        {publishOpen && project && (
                            <PublishDialog
                                title={project.title}
                                current={published[project.id] ?? []}
                                onSave={(classIds, settings) => setProjectClasses(project.id, classIds, settings)}
                                onClose={() => setPublishOpen(false)}
                            />
                        )}
                        </>
                    )}
            </TopBar>

            {sync.conflict && (
                <div className="modeling-banner" role="alert">
                    <p>{t("modeling.conflict")}</p>
                    <button type="button" className="modeling-banner-btn" onClick={() => {
                        sync.takeTheirs();
                        onReload();
                    }}>
                        {t("modeling.conflictTheirs")}
                    </button>
                    <button type="button" className="modeling-banner-btn primary" onClick={sync.keepMine}>
                        {t("modeling.conflictMine")}
                    </button>
                </div>
            )}
            {mediaError && (
                <div className="modeling-banner" role="alert">
                    <p>{t("modeling.mediaNotUploaded", { name: mediaError.name, reason: t(authErrorKey(mediaError.error)) })}</p>
                    <button type="button" className="modeling-banner-btn" onClick={() => setMediaError(null)}>
                        {t("classes.close")}
                    </button>
                </div>
            )}
            <PanelTabs tab={tab} onChange={setTab}/>
            <div className={`content-modeling tab-${tab}`} ref={contentRef}>
                <div className="explanation-panel" id="panel-explanation" style={{ flex: `0 1 ${panelWidths[0]}%` }}>
                    <div className="explanation">
                        {project && !isTeacher && !review && <AssignmentInfo publications={published[project.id] ?? []}/>}
                        {project && <Markdown text={project.explanation}/>}
                    </div>
                    {project && (
                        <div className="explanation-footer">
                            {project.estimatedTime !== null && (
                                <>
                                    <span>{t("modeling.estimatedTime")} <strong>{t("modeling.minutes", { n: project.estimatedTime })}</strong></span>
                                    <span className="code-footer-dot">·</span>
                                </>
                            )}
                            <span>{t("modeling.equipment")} <strong>
                                {project.equipment.length > 0 ? project.equipment.join(", ") : t("modeling.equipmentNone")}
                            </strong></span>
                        </div>
                    )}
                </div>

                <div
                    className={`panel-divider${draggingDivider === 0 ? " dragging" : ""}`}
                    onPointerDown={handleDividerPointerDown(0)}
                    {...columnDividerProps(0)}
                    aria-label={t("modeling.resizeExplanationCode")}
                />

                <div className="code-panel" id="panel-code" style={{ flex: `0 1 ${panelWidths[1]}%` }}>
                    <div className="code">
                        <div className="code-panel-actions">
                            {simulation.running ? (
                                <button className="play-btn" aria-label={t("modeling.stopRun")} title={t("modeling.stopRun")}
                                        onClick={simulation.stop}>
                                    <span className="stop-icon" aria-hidden="true"/>
                                </button>
                            ) : (
                                <button
                                    className="play-btn"
                                    aria-label={t("modeling.runSimulation")}
                                    title={wasm === "loading" ? t("modeling.wasmLoading") : t("modeling.runShortcut", { keys: shortcutKeys })}
                                    onClick={runSimulation}
                                    disabled={!wasmReady}
                                >
                                    <img src={PlayIcon20px} alt=""/>
                                </button>
                            )}
                        </div>
                        {/* Start values run once before the first step; model rules run every step */}
                        <div className="code-block code-block-start">
                            <p className="code-block-label">{t("modeling.startValues")}</p>
                            <div className="code-editor">
                                <ErrorBoundary compact>
                                    <CodeEditor ref={startEditorRef} value={start} onChange={handleStartChange} onRun={runSimulation} readOnly={!!review}/>
                                </ErrorBoundary>
                            </div>
                        </div>
                        <div className="code-block code-block-model">
                            <p className="code-block-label">{t("modeling.modelRules")}</p>
                            <div className="code-editor">
                                <ErrorBoundary compact>
                                    <CodeEditor ref={modelEditorRef} value={model} onChange={handleModelChange} onRun={runSimulation} readOnly={!!review}/>
                                </ErrorBoundary>
                            </div>
                        </div>
                    </div>

                    <div className="code-footer">
                        <span>
                            {t("modeling.steps")}{" "}
                            <input
                                type="number"
                                className="steps-input"
                                min={1}
                                max={MAX_STEPS}
                                step={1}
                                placeholder={String(DEFAULT_STEPS)}
                                value={steps}
                                onChange={(e) => handleStepsChange(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && runSimulation()}
                            />
                        </span>
                        {/* How the last run ended, so "nothing happened" always has an explanation */}
                        {wasm === "failed" && <p className="run-status warning" role="alert">{t("modeling.wasmFailed")}</p>}
                        {simulation.running && (
                            <p className="run-status" role="status">
                                {t("modeling.running", { steps: simulation.progress.toLocaleString(language) })}
                            </p>
                        )}
                        {runStatus && (
                            <p className={`run-status${runStatus.kind === "stopped" ? "" : " warning"}`} role="status">
                                {describeRun(runStatus)}
                            </p>
                        )}
                        {nonFinite && <p className="run-status warning" role="status">{describeNonFinite(nonFinite)}</p>}
                    </div>
                </div>
                <div
                    className={`panel-divider${draggingDivider === 1 ? " dragging" : ""}`}
                    onPointerDown={handleDividerPointerDown(1)}
                    {...columnDividerProps(1)}
                    aria-label={t("modeling.resizeCodeAnalysis")}
                />

                <div className="analysis-panel" id="panel-analysis" style={{ flex: `0 1 ${panelWidths[2]}%` }}>
                    <div className="analysis-stack" ref={analysisStackRef}>
                        {rows.map((row, index) => {
                            const key = row.kind === "graph" ? row.graph.id : row.item.id;
                            const rowStyle: React.CSSProperties = {
                                flex: `0 1 ${rowHeights[index] ?? 100 / rows.length}%`,
                            };
                            return (
                                <Fragment key={key}>
                                    {index > 0 && (
                                        <div
                                            className={`panel-divider-row${draggingRowDivider === index - 1 ? " dragging" : ""}`}
                                            onPointerDown={handleRowDividerPointerDown(index - 1)}
                                            {...rowDividerProps(index - 1)}
                                            aria-label={t("modeling.resizeAnalysisPanels")}
                                        />
                                    )}
                                    {row.kind === "graph" ? (
                                        <div className="analysis" style={rowStyle} data-graph-id={row.graph.id}>
                                            <div className="analysis-panel-actions">
                                                <ExportMenu label={t("modeling.export")} items={[
                                                    { label: t("modeling.exportRunCsv"), disabled: !history, onSelect: exportRunCsv },
                                                    {
                                                        label: t("modeling.exportPng"),
                                                        disabled: !row.graph.x || row.graph.ys.length === 0,
                                                        onSelect: () => exportGraph(row.graph, index, "png"),
                                                    },
                                                    {
                                                        label: t("modeling.exportSvg"),
                                                        disabled: !row.graph.x || row.graph.ys.length === 0,
                                                        onSelect: () => exportGraph(row.graph, index, "svg"),
                                                    },
                                                ]}/>
                                                <button
                                                    type="button"
                                                    className="analysis-media-remove"
                                                    onClick={() => setGraphList(graphs.filter((g) => g.id !== row.graph.id))}
                                                    aria-label={t("modeling.closeGraph")}
                                                >
                                                    <img src={CloseIcon20px} alt=""/>
                                                </button>
                                            </div>
                                            {/* A new run gets a fresh chance to render */}
                                            <ErrorBoundary compact resetKey={history}>
                                                <Graph
                                                    samples={history}
                                                    variables={variables}
                                                    x={row.graph.x}
                                                    ys={row.graph.ys}
                                                    onChange={(x, ys) => updateGraph(row.graph.id, x, ys)}
                                                    markersFor={markersFor}
                                                    runPrompt={t("modeling.chartRunPrompt")}
                                                />
                                            </ErrorBoundary>
                                        </div>
                                    ) : (
                                        <ErrorBoundary compact>
                                            <MediaTile
                                                item={row.item}
                                                style={rowStyle}
                                                onRemove={() => removeMediaItem(row.item.id)}
                                                onChange={updateMediaItem}
                                                readOnly={!!review}
                                            />
                                        </ErrorBoundary>
                                    )}
                                </Fragment>
                            );
                        })}
                    </div>

                </div>
            </div>
        </div>
    );
}

// Whose work a teacher is looking at, and which copy: the handed-in one or the current work
function ReviewBar({ review }: { review: Review }) {
    const { t, language } = useTranslation();
    const navigate = useNavigate();
    return (
        <div className="review-bar">
            <span className="review-student">
                {review.studentName}
                {review.submittedAt !== null && ` · ${t("handIn.handedInAt", {
                    time: new Date(review.submittedAt).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" }),
                })}`}
                {review.submittedAt === null && ` · ${t("review.notHandedIn")}`}
            </span>
            {review.submittedAt !== null && review.hasWork && (
                <div className="review-toggle" role="radiogroup" aria-label={t("review.whichCopy")}>
                    {(["submission", "work"] as const).map((which) => (
                        <button key={which} type="button" role="radio" aria-checked={review.showing === which}
                                className={review.showing === which ? "active" : ""} onClick={() => review.onShow(which)}>
                            {which === "submission" ? t("review.handedInCopy") : t("review.currentWork")}
                        </button>
                    ))}
                </div>
            )}
            <button type="button" className="review-back" onClick={() => navigate("/classes", { state: { classId: review.classId } })}>
                {t("review.backToClass")}
            </button>
        </div>
    );
}

// A student's own assignment's name, edited in place in the top bar; Enter or leaving the field saves it
function TitleField({ title, onSave }: { title: string; onSave: (title: string) => Promise<Result> }) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState(title);
    useEffect(() => setDraft(title), [title]);

    const commit = async () => {
        const next = draft.trim();
        if (!next || next === title) return setDraft(title);
        const res = await onSave(next.slice(0, 100));
        if (!res.ok) setDraft(title);
    };

    return (
        <input
            className="title-field"
            aria-label={t("modeling.assignmentName")}
            value={draft}
            maxLength={100}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                    setDraft(title);
                    e.currentTarget.blur();
                }
            }}
        />
    );
}

// Whether the project's latest changes are saved on the server
function SaveIndicator({ status }: { status: SaveStatus }) {
    const { t } = useTranslation();
    const text = {
        saved: t("modeling.saveSaved"),
        saving: t("modeling.saveSaving"),
        offline: t("modeling.saveOffline"),
        error: t("modeling.saveError"),
        conflict: t("modeling.saveConflict"),
    }[status];
    return <span className={`save-indicator ${status}`} role="status">{text}</span>;
}

export default Modeling;