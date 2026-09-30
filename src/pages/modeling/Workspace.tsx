import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../modeling.css";

import arrowIcon14px from "../../assets/icons/arrow-14px.svg";
import CopyIcon20px from "../../assets/icons/copy-20px.svg";
import DownloadIcon20px from "../../assets/icons/download-20px.svg";
import EditIcon20px from "../../assets/icons/edit-20px.svg";
import TrashIcon20px from "../../assets/icons/trash-20px.svg";
import ConfirmButton from "../../components/ConfirmButton";
import ErrorBoundary from "../../components/ErrorBoundary";
import { formatMark } from "../../components/Feedback";
import HandInDialog from "../../components/HandInDialog";
import MediaTile, { pointUnits } from "../../components/MediaTile.tsx";
import PublishDialog from "../../components/PublishDialog";
import type { StarterChoice } from "../../components/PublishDialog";
import TopBar from "../../components/TopBar";
import { newGraph, toLines } from "../../data/Projects.tsx";
import type { GraphConfig, Project, ProjectWork } from "../../data/Projects.tsx";
import { api, errorOf } from "../../lib/api";
import type { Result } from "../../lib/api";
import { assignmentFileContents } from "../../lib/assignmentFile";
import { authErrorKey } from "../../lib/authErrors";
import { runCsv } from "../../lib/csv";
import { downloadFile, fileNameFor } from "../../lib/download";
import { useAuth } from "../../lib/useAuth";
import { useProjects } from "../../lib/useProjects";
import { dueDate, usePublished } from "../../lib/usePublished";
import { useTranslation } from "../../lib/useTranslations";
import { useWorkSync } from "../../lib/workSync";
import { translateCode } from "../../lib/modelLanguage";
import { codeUnits } from "../../lib/units";
import type { OpenedWork, Submission } from "../../lib/workSync";
import CodePanel from "./CodePanel";
import ExplanationPanel from "./ExplanationPanel";
import GraphPanel from "./GraphPanel";
import InsertMenu from "./InsertMenu";
import { starterMedia } from "./media";
import { PanelTabs, ReviewBar, SaveIndicator, TitleField } from "./parts";
import type { PanelTab, Review } from "./parts";
import { useMediaPanels } from "./useMediaPanels";
import { useModelRun } from "./useModelRun";
import { storedSplit, storeSplit, useResizableSplit } from "./useResizableSplit";

// Start values run once; model rules run every step. The comments are in the interface's language.
const defaultStart = (comment: string) => `// ${comment}\nt = 0        // s\ndt = 0.01    // s\n`;
const DEFAULT_MODEL = "stop als t >= 10\n";

const MIN_PANEL_WIDTH_PERCENT = 15;
const MIN_ROW_HEIGHT_PERCENT = 15;
const EXPLANATION_COLLAPSED_KEY = "physicsgo_explanation_collapsed";
// Column widths, and row heights per number of rows, are remembered in this browser
const COLUMNS_KEY = "physicsgo_modeling_columns";
const rowsKey = (count: number) => `physicsgo_modeling_rows_${count}`;

// Variables the code assigns (`name = ...`), in the order they first appear
function codeVariables(source: string): string[] {
    const names = new Set<string>();
    for (const line of source.split("\n")) {
        const match = line.replace(/\/\/.*$/, "").match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/);
        if (match) names.add(match[1]);
    }
    return [...names];
}

type AnalysisRow = { kind: "graph"; graph: GraphConfig } | { kind: "media"; item: ReturnType<typeof useMediaPanels>["mediaItems"][number] };

/**
 * The modeling page for one assignment (or an empty workspace): the explanation, the code, and the
 * graphs and media, in three resizable columns (tabs on narrow screens). A student's work is saved as
 * it changes; a teacher reviewing a student's work, or previewing an assignment, saves nothing.
 */
export default function ModelingWorkspace({ project, opened, onReload, review, preview = false }: {
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
    const columns = useResizableSplit<[number, number, number]>(
        "x",
        () => storedSplit(COLUMNS_KEY, 3, MIN_PANEL_WIDTH_PERCENT) ?? [100 / 3, 100 / 3, 100 / 3],
        MIN_PANEL_WIDTH_PERCENT,
    );
    const panelWidths = columns.sizes;
    useEffect(() => {
        if (columns.dragging === null) storeSplit(COLUMNS_KEY, columns.sizes);
    }, [columns.sizes, columns.dragging]);
    // The explanation can be folded away to a narrow strip, giving the code and graphs the room;
    // remembered in this browser
    const [explanationCollapsed, setExplanationCollapsed] = useState(() => {
        try {
            return localStorage.getItem(EXPLANATION_COLLAPSED_KEY) === "1";
        } catch {
            return false;
        }
    });
    const toggleExplanation = () => setExplanationCollapsed((collapsed) => {
        try {
            localStorage.setItem(EXPLANATION_COLLAPSED_KEY, collapsed ? "0" : "1");
        } catch {
            // Not remembered, but it still folds
        }
        return !collapsed;
    });
    // Folded, the code and analysis share the room in the proportion they had
    const columnStyle = (i: 1 | 2) => ({ flex: explanationCollapsed ? `${panelWidths[i]} 1 0%` : `0 1 ${panelWidths[i]}%` });

    // ---------- the work ----------
    // A project reopens with the code and steps saved for it; an empty project starts fresh
    const savedWork = opened.work;
    // Media the work starts with: what was saved, or for new work the project's starter media
    const [initialMedia] = useState(() => savedWork?.media ?? starterMedia(project));
    // Viewing a student's work or previewing a project: nothing is saved
    const noSaving = !!review || preview;
    const sync = useWorkSync(noSaving ? null : project?.id ?? null, opened);
    // The handed-in copy of this work, if any (students)
    const [submission, setSubmission] = useState<Submission | null>(opened.submission);
    const [handInOpen, setHandInOpen] = useState(false);
    // Why deleting the student's own assignment failed
    const [deleteError, setDeleteError] = useState<string | null>(null);
    // New work starts from the project's starter code. Code is shown with the keywords of the
    // interface's language (both run), and follows it when the language changes.
    const [start, setStart] = useState(() => translateCode(
        savedWork?.start ?? project?.start ?? defaultStart(t("modeling.defaultStartComment")),
        language,
    ));
    const [model, setModel] = useState(() => translateCode(savedWork?.model ?? project?.model ?? DEFAULT_MODEL, language));
    useEffect(() => {
        setStart((code) => translateCode(code, language));
        setModel((code) => translateCode(code, language));
    }, [language]);
    const [steps, setSteps] = useState(savedWork?.steps ?? "");
    // A new project starts with one empty graph
    const [graphs, setGraphs] = useState<GraphConfig[]>(() => savedWork?.graphs
        ?? (project?.graphs.length ? project.graphs.map((g) => newGraph(g.x, toLines(g.ys))) : [newGraph()]));

    const media = useMediaPanels({
        project,
        initialMedia,
        reviewedStudent: review?.studentId,
        noSaving,
        graphCount: graphs.length,
        onChange: (items) => saveWork({ media: items }),
    });
    // The code new work starts with, in the interface's language
    const starterStart = translateCode(project?.start ?? defaultStart(t("modeling.defaultStartComment")), language);
    const starterModel = translateCode(project?.model ?? DEFAULT_MODEL, language);
    const codeIsStarter = start.trim() === starterStart.trim() && model.trim() === starterModel.trim();
    function resetCode() {
        setStart(starterStart);
        setModel(starterModel);
        saveWork({ start: starterStart, model: starterModel });
    }

    // What students start with is the assignment's saved starter code, graphs and media; a teacher
    // who changed them here is told so when publishing (their changes are only their own work)
    const currentGraphs = () => graphs.map((g) => ({ x: g.x, ys: g.ys.map((y) => y.name) }));
    function starterChoice(): StarterChoice | undefined {
        if (!project || !isTeacher || noSaving) return undefined;
        const starterGraphs = project.graphs.length ? project.graphs : [{ x: "", ys: [] }];
        const codeChanged = !codeIsStarter
            || JSON.stringify(starterGraphs.map((g) => ({ x: g.x, ys: g.ys }))) !== JSON.stringify(currentGraphs());
        const mediaLeftOut = media.mediaItems.some((m) => m.source !== "project");
        return codeChanged || mediaLeftOut ? { own: project.mine, codeChanged, mediaLeftOut } : undefined;
    }

    const run = useModelRun();
    const runModel = () => run.run(start, model, steps, media.measuredData);

    // Every change to a project is saved with it and counts as an edit
    function saveWork(changes: Partial<ProjectWork>) {
        if (!project || noSaving) return;
        sync.save({ start, model, steps, graphs, media: media.savedMedia(), ...changes });
    }

    // Changes made in this browser that the server hasn't got yet (offline, or from before work
    // was saved on the server) are sent as soon as the project opens
    useEffect(() => {
        if (opened.unsynced && savedWork) sync.save(savedWork);
        // Only on opening: later changes are saved as they're made
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    // The assignment as a file that "Open assignment" on the dashboard can open again
    function exportAssignment() {
        if (!project) return;
        const contents = assignmentFileContents(project.title, project.explanation, { start, model, steps, graphs, media: media.savedMedia() });
        downloadFile(fileNameFor(project.title, "physicsgo.json"), new Blob([contents], { type: "application/json" }));
    }

    // Every variable of the last run at every step, for a spreadsheet
    function exportRunCsv() {
        if (!run.history) return;
        const csv = runCsv(run.history, codeVariables(`${start}\n${model}`), language);
        downloadFile(fileNameFor(`${project?.title ?? "model"} run`, "csv"), new Blob([csv], { type: "text/csv" }));
    }

    // What's still waiting is saved first, so nothing is written for the assignment after it's gone
    async function deleteOwnAssignment() {
        if (!project) return;
        await sync.saveNow();
        const res = await deleteProject(project.id);
        if (res.ok) navigate("/dashboard", { replace: true });
        else setDeleteError(res.error);
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

    // Variables from the code and the measured data, plus any the last run produced that neither shows anymore
    const variables = useMemo(() => {
        const names = codeVariables(`${start}\n${model}`);
        for (const name of [...media.measuredData.map((s) => s.name), ...(run.history?.names ?? [])]) {
            if (!names.includes(name)) names.push(name);
        }
        return names;
    }, [start, model, run.history, media.measuredData]);

    // Units for axis titles, legends and tables: from comments in the code (h = 10 // m) and measured points
    const units = useMemo(() => new Map([
        ...media.mediaItems.flatMap(pointUnits),
        ...codeUnits(`${start}\n${model}`),
    ]), [start, model, media.mediaItems]);

    // ---------- analysis column: graphs, then media ----------
    const rows: AnalysisRow[] = useMemo(() => [
        ...graphs.map((graph) => ({ kind: "graph" as const, graph })),
        ...media.mediaItems.map((item) => ({ kind: "media" as const, item })),
    ], [graphs, media.mediaItems]);
    const stack = useResizableSplit<number[]>("y", [100], MIN_ROW_HEIGHT_PERCENT);
    const { setSizes: setRowHeights } = stack;
    // Whenever a graph or media panel is added or removed, the stack gets the heights last used for
    // that many rows, or is split evenly
    useEffect(() => {
        setRowHeights(storedSplit(rowsKey(rows.length), rows.length, MIN_ROW_HEIGHT_PERCENT) ?? Array(rows.length).fill(100 / rows.length));
    }, [rows.length, setRowHeights]);
    useEffect(() => {
        if (stack.dragging === null && stack.sizes.length === rows.length && rows.length > 1) storeSplit(rowsKey(rows.length), stack.sizes);
    }, [stack.sizes, stack.dragging, rows.length]);

    // Below about 1024px wide the three columns show one at a time (modeling.css)
    const [tab, setTab] = useState<PanelTab>("explanation");

    return (
        <div className="modeling-page">
            <TopBar
                title={ownAssignment && project
                    ? <TitleField title={project.title} onSave={(title) => updateProject(project.id, { title })}/>
                    : project?.title ?? ""}
                after={project && !noSaving && <SaveIndicator status={sync.status} localFailed={sync.localFailed}/>}
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
                        <input ref={media.fileInputRef} type="file" onChange={media.handleFileChange} style={{ display: "none" }}/>
                        {/* The icon buttons sit together, like settings and help */}
                        <div className="nav-icon-group">
                            <InsertMenu
                                full={media.panelsFull}
                                onGraph={() => !media.panelsFull && setGraphList([...graphs, newGraph()])}
                                onFile={media.openFilePicker}
                                onEmbed={media.addEmbed}
                            />
                            {project && (
                                <button type="button" className="nav-icon-btn" onClick={exportAssignment}
                                        aria-label={t("modeling.export")} title={t("modeling.exportHint")}>
                                    <img src={DownloadIcon20px} alt=""/>
                                </button>
                            )}
                            {isTeacher && project && (project.mine ? (
                                <button type="button" className="nav-icon-btn" onClick={() => navigate(`/projects/${project.id}/edit`)}
                                        aria-label={t("projectEditor.edit")} title={t("projectEditor.edit")}>
                                    <img src={EditIcon20px} alt=""/>
                                </button>
                            ) : (
                                <button type="button" className="nav-icon-btn"
                                        onClick={() => navigate("/projects/new", { state: { copyOf: project.id } })}
                                        aria-label={t("projectEditor.duplicate")} title={t("projectEditor.duplicateHint")}>
                                    <img src={CopyIcon20px} alt=""/>
                                </button>
                            ))}
                            {/* A student's own assignment; the first click asks to confirm */}
                            {ownAssignment && (
                                <ConfirmButton className="nav-icon-btn delete-own" label={t("modeling.deleteOwn")} onConfirm={deleteOwnAssignment}>
                                    <img src={TrashIcon20px} alt=""/>
                                </ConfirmButton>
                            )}
                        </div>
                        {/* Teachers publish projects to their classes; students hand them in */}
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
                                        <span className={`hand-in-chip status-${submission.status}`}>
                                            {submission.status === "returned" ? t("feedback.chipReturned")
                                                : submission.status === "approved" ? t("feedback.approved")
                                                    + (submission.mark !== null ? ` · ${formatMark(submission.mark, language)}` : "")
                                                : t(sync.version > submission.workVersion ? "handIn.chipChanged" : "handIn.handedInAt", {
                                                    time: new Date(submission.submittedAt).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" }),
                                                })}
                                            {submission.status === "handed_in" && (dueDate(published[project.id]) ?? Infinity) < submission.submittedAt
                                                && ` · ${t("dashboard.late")}`}
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
                                starter={starterChoice()}
                                onSave={async (classIds, settings, useMine) => {
                                    if (useMine) {
                                        const updated = await updateProject(project.id, { start, model, graphs: currentGraphs() });
                                        if (!updated.ok) return updated;
                                    }
                                    const res = await setProjectClasses(project.id, classIds, settings);
                                    // Published to at least one class: back to the dashboard, where it now shows with its classes
                                    if (res.ok && classIds.length > 0) navigate("/dashboard");
                                    return res;
                                }}
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
            {sync.localFailed && (sync.status === "offline" || sync.status === "error") && (
                <div className="modeling-banner" role="alert">
                    <p>{t("modeling.storageFull")}</p>
                </div>
            )}
            {deleteError && (
                <div className="modeling-banner" role="alert">
                    <p>{t("modeling.deleteOwnFailed", { reason: t(authErrorKey(deleteError)) })}</p>
                    <button type="button" className="modeling-banner-btn" onClick={() => setDeleteError(null)}>
                        {t("classes.close")}
                    </button>
                </div>
            )}
            {media.mediaError && (
                <div className="modeling-banner" role="alert">
                    <p>
                        {t(media.mediaError.kept ? "modeling.mediaNotUploaded" : "modeling.mediaNotKept", {
                            name: media.mediaError.name,
                            reason: t(authErrorKey(media.mediaError.error)),
                        })}
                    </p>
                    <button type="button" className="modeling-banner-btn" onClick={() => media.setMediaError(null)}>
                        {t("classes.close")}
                    </button>
                </div>
            )}
            <PanelTabs tab={tab} onChange={setTab}/>
            <div className={`content-modeling tab-${tab}`} ref={columns.containerRef}>
                <ExplanationPanel
                    project={project}
                    style={explanationCollapsed ? undefined : { flex: `0 1 ${panelWidths[0]}%` }}
                    collapsed={explanationCollapsed}
                    onToggle={toggleExplanation}
                    review={review}
                    student={!isTeacher && !review}
                    submission={submission}
                    publications={project ? published[project.id] ?? [] : []}
                />

                {!explanationCollapsed && (
                    <div className={`panel-divider${columns.dragging === 0 ? " dragging" : ""}`}
                         {...columns.dividerProps(0)} aria-label={t("modeling.resizeExplanationCode")}/>
                )}

                <CodePanel
                    style={columnStyle(1)}
                    run={run}
                    start={start}
                    model={model}
                    steps={steps}
                    readOnly={!!review}
                    onStart={handleStartChange}
                    onModel={handleModelChange}
                    onSteps={handleStepsChange}
                    onRun={runModel}
                    onReset={codeIsStarter ? undefined : resetCode}
                />

                <div className={`panel-divider${columns.dragging === 1 ? " dragging" : ""}`}
                     {...columns.dividerProps(1)} aria-label={t("modeling.resizeCodeAnalysis")}/>

                <div className="analysis-panel" id="panel-analysis" style={columnStyle(2)}>
                    <div className="analysis-stack" ref={stack.containerRef}>
                        {rows.map((row, index) => {
                            const style = { flex: `0 1 ${stack.sizes[index] ?? 100 / rows.length}%` };
                            return (
                                <Fragment key={row.kind === "graph" ? row.graph.id : row.item.id}>
                                    {index > 0 && (
                                        <div className={`panel-divider-row${stack.dragging === index - 1 ? " dragging" : ""}`}
                                             {...stack.dividerProps(index - 1)} aria-label={t("modeling.resizeAnalysisPanels")}/>
                                    )}
                                    {row.kind === "graph" ? (
                                        <GraphPanel
                                            graph={row.graph}
                                            index={index}
                                            style={style}
                                            history={run.history}
                                            variables={variables}
                                            units={units}
                                            markersFor={media.markersFor}
                                            fileBase={project?.title ?? "model"}
                                            onChange={(changes) => setGraphList(graphs.map((g) => (g.id === row.graph.id ? { ...g, ...changes } : g)))}
                                            onRemove={() => setGraphList(graphs.filter((g) => g.id !== row.graph.id))}
                                            onExportRun={exportRunCsv}
                                        />
                                    ) : (
                                        <ErrorBoundary compact>
                                            <MediaTile
                                                item={row.item}
                                                style={style}
                                                onRemove={() => media.removeMediaItem(row.item.id)}
                                                onChange={media.updateMediaItem}
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
