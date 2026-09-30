import init, { run_with_data as runInterpreter } from "../wasm/interpreterGo";
import type { CodeEditorHandle, InterpreterError } from "../components/codeEditor.tsx";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import "./modeling.css";

import NavBrand from "../components/NavBrand";
import NavActions from "../components/NavActions";
import arrowIcon14px from "../assets/icons/arrow-14px.svg";
import PlayIcon20px from "../assets/icons/play-20px.svg";
import PlusIcon14px from "../assets/icons/plus-14px.svg";
import CloseIcon20px from "../assets/icons/close-20px.svg";

import Graph from "../components/Graph.tsx";
import MediaTile, { DEFAULT_POINT_STEP, pointSeries } from "../components/MediaTile.tsx";
import type { MediaItem } from "../components/MediaTile.tsx";
import { deleteMediaFile, loadMediaFile, mediaKey, saveMediaFile } from "../lib/mediaStore";
import { realPoints } from "../lib/calibration";
import type { ChartPoint } from "../components/lineChart.tsx";
import { newGraph, normalizeWork } from "../data/Projects.tsx";
import { useProjects } from "../lib/useProjects";
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
import { usePublished } from "../lib/usePublished";
import PublishDialog from "../components/PublishDialog";
import ErrorBoundary from "../components/ErrorBoundary";

// Start values run once; model rules run every step
const DEFAULT_START = [
    "// Initialiseer Parameters",
    "t = 0",
    "dt = 0.01 // in seconds",
    "",
].join("\n");
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

const MIN_PANEL_WIDTH_PERCENT = 15;
const MIN_ROW_HEIGHT_PERCENT = 15;

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

// Work is saved per account, so the workspace only opens once it's known who is signed in and
// their work has loaded; a different account gets a fresh workspace, not the previous one's state
function Modeling() {
    const location = useLocation();
    const { user } = useAuth();
    const presetId = (location.state as { presetId?: string } | null)?.presetId;
    const { projects, byId } = useProjects();
    const project = byId(presetId);
    const [opened, setOpened] = useState<OpenedWork | null>(null);
    // Bumped to load the work again, e.g. after choosing another device's version
    const [reloads, setReloads] = useState(0);

    useEffect(() => {
        if (!user || projects === null) return;
        if (!project) return setOpened(NO_WORK);
        let cancelled = false;
        setOpened(null);
        openWork(project.id).then((work) => {
            if (!cancelled) setOpened(work);
        });
        return () => {
            cancelled = true;
        };
    }, [user, projects, project, reloads]);

    if (!user || !opened) return null;
    return (
        <ModelingWorkspace
            key={`${user.id}-${reloads}`}
            project={project}
            opened={opened}
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

        const { dividerIndex, startWidths } = drag;
        const pairTotal = startWidths[dividerIndex] + startWidths[dividerIndex + 1];

        let left = startWidths[dividerIndex] + deltaPercent;
        let right = pairTotal - left;

        if (left < MIN_PANEL_WIDTH_PERCENT) {
            left = MIN_PANEL_WIDTH_PERCENT;
            right = pairTotal - left;
        } else if (right < MIN_PANEL_WIDTH_PERCENT) {
            right = MIN_PANEL_WIDTH_PERCENT;
            left = pairTotal - right;
        }

        const next: [number, number, number] = [...startWidths];
        next[dividerIndex] = left;
        next[dividerIndex + 1] = right;
        setPanelWidths(next);
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
    const [start, setStart] = useState(savedWork?.start ?? project?.start ?? DEFAULT_START);
    const [model, setModel] = useState(savedWork?.model ?? project?.model ?? DEFAULT_MODEL);
    const [steps, setSteps] = useState(savedWork?.steps ?? "");
    // A new project starts with one empty graph
    const [graphs, setGraphs] = useState<GraphConfig[]>(() => savedWork?.graphs ?? [newGraph()]);
    // Media is loaded from this device after opening; mediaLoaded is false until then
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const mediaLoaded = useRef(!project);
    const startEditorRef = useRef<CodeEditorHandle>(null);
    const modelEditorRef = useRef<CodeEditorHandle>(null);
    const [wasmReady, setWasmReady] = useState(false);

    // Every change to a project is saved with it and counts as an edit
    function saveWork(changes: Partial<ProjectWork>) {
        if (!project || noSaving) return;
        // Until the media files have loaded, keep the media that was saved before
        const media = mediaLoaded.current ? toSaved(mediaItems) : initialMedia;
        sync.save({ start, model, steps, graphs, media, ...changes });
    }

    // Hands in the work as it is now: the latest changes are saved first, so the teacher sees exactly this
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

    useEffect(() => {
        init().then(() => setWasmReady(true));
    }, []);

    interface RunResult {
        ok: boolean;
        // One entry per step: every variable's value after that step
        history: Map<string, number>[];
        errors: { line: number; column: number; message: string; block: string }[];
    }

    // Results of the last run; the chart stays empty until the model has run
    const [history, setHistory] = useState<Map<string, number>[] | null>(null);

    // Points plotted on videos, as variables the code can read at the current t
    const measuredData = useMemo(() => mediaItems.flatMap(pointSeries), [mediaItems]);

    // Variables from the code and the measured data, plus any the last run produced that neither shows anymore
    const variables = useMemo(() => {
        const names = codeVariables(`${start}\n${model}`);
        for (const name of [...measuredData.map((s) => s.name), ...(history?.[0]?.keys() ?? [])]) {
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

    function runSimulation() {
        if (!wasmReady) return;
        startEditorRef.current?.clearErrors();
        modelEditorRef.current?.clearErrors();

        const result = runInterpreter(start, model, stepCount(), measuredData) as RunResult;

        if (!result.ok) {
            // Each error's line is counted in its own block, which is its own editor
            const inBlock = (block: string): InterpreterError[] => result.errors
                .filter((e) => e.block === block)
                .map((e) => ({ line: e.line, column: e.column, message: e.message }));
            startEditorRef.current?.setErrors(inBlock("start"));
            modelEditorRef.current?.setErrors(inBlock("model"));
            return;
        }

        setHistory(result.history);
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

        const { dividerIndex, startHeights } = drag;
        const pairTotal = startHeights[dividerIndex] + startHeights[dividerIndex + 1];

        let top = startHeights[dividerIndex] + deltaPercent;
        let bottom = pairTotal - top;

        if (top < MIN_ROW_HEIGHT_PERCENT) {
            top = MIN_ROW_HEIGHT_PERCENT;
            bottom = pairTotal - top;
        } else if (bottom < MIN_ROW_HEIGHT_PERCENT) {
            bottom = MIN_ROW_HEIGHT_PERCENT;
            top = pairTotal - bottom;
        }

        const next = [...startHeights];
        next[dividerIndex] = top;
        next[dividerIndex + 1] = bottom;
        setRowHeights(next);
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

    return (
        <div className="modeling-page">
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <NavBrand />
                    <div className="spacer"></div>
                    <h2>{ project?.title }</h2>
                    {project && !noSaving && <SaveIndicator status={sync.status}/>}
                </div>

                <div className="system-actions">
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
                        {isTeacher && project && (
                            <button
                                className="insert-media-btn"
                                onClick={() => navigate(project.mine ? `/projects/${project.id}/edit` : "/projects/new", {
                                    state: project.mine ? undefined : { copyOf: project.id },
                                })}
                            >
                                <p>{project.mine ? t("projectEditor.edit") : t("projectEditor.duplicate")}</p>
                            </button>
                        )}
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
                                onSave={(classIds) => setProjectClasses(project.id, classIds)}
                                onClose={() => setPublishOpen(false)}
                            />
                        )}
                        </>
                    )}
                    <NavActions/>
                </div>
            </div>

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
            <div className="content-modeling" ref={contentRef}>
                <div className="explanation-panel" style={{ flex: `0 0 ${panelWidths[0]}%` }}>
                    <div className="explanation">
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
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={t("modeling.resizeExplanationCode")}
                />

                <div className="code-panel" style={{ flex: `0 0 ${panelWidths[1]}%` }}>
                    <div className="code">
                        <div className="code-panel-actions">
                            <button className="play-btn" aria-label={t("modeling.runSimulation")} onClick={runSimulation} disabled={!wasmReady}>
                                <img src={PlayIcon20px} alt=""/>
                            </button>
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
                    </div>
                </div>
                <div
                    className={`panel-divider${draggingDivider === 1 ? " dragging" : ""}`}
                    onPointerDown={handleDividerPointerDown(1)}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={t("modeling.resizeCodeAnalysis")}
                />

                <div className="analysis-panel" style={{ flex: `0 0 ${panelWidths[2]}%` }}>
                    <div className="analysis-stack" ref={analysisStackRef}>
                        {rows.map((row, index) => {
                            const key = row.kind === "graph" ? row.graph.id : row.item.id;
                            const rowStyle: React.CSSProperties = {
                                flex: `0 0 ${rowHeights[index] ?? 100 / rows.length}%`,
                            };
                            return (
                                <Fragment key={key}>
                                    {index > 0 && (
                                        <div
                                            className={`panel-divider-row${draggingRowDivider === index - 1 ? " dragging" : ""}`}
                                            onPointerDown={handleRowDividerPointerDown(index - 1)}
                                            role="separator"
                                            aria-orientation="horizontal"
                                            aria-label={t("modeling.resizeAnalysisPanels")}
                                        />
                                    )}
                                    {row.kind === "graph" ? (
                                        <div className="analysis" style={rowStyle}>
                                            <div className="analysis-panel-actions">
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