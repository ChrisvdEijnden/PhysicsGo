import init, { run_with_data as runInterpreter } from "../wasm/interpreterGo";
import type { CodeEditorHandle, InterpreterError } from "../components/codeEditor.tsx";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./modeling.css";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import NavBrand from "../components/NavBrand";
import arrowIcon14px from "../assets/icons/arrow-14px.svg";
import PlayIcon20px from "../assets/icons/play-20px.svg";
import PlusIcon14px from "../assets/icons/plus-14px.svg";
import CloseIcon20px from "../assets/icons/close-20px.svg";

import Graph from "../components/Graph.tsx";
import MediaTile, { DEFAULT_POINT_STEP, pointSeries } from "../components/MediaTile.tsx";
import type { MediaItem } from "../components/MediaTile.tsx";
import { deleteMediaFile, loadMediaFile, mediaKey, saveMediaFile } from "../lib/mediaStore";
import type { ChartPoint } from "../components/lineChart.tsx";
import {Projects, markProjectEdited, loadProjectWork, saveProjectWork} from "../data/Projects.tsx";
import { newGraph } from "../data/Projects.tsx";
import type { GraphConfig, MediaCategory, ProjectWork, SavedMedia, YLine } from "../data/Projects.tsx";
import CodeEditor from "../components/codeEditor.tsx";
import { useTranslation } from "../lib/useTranslations";

const DEFAULT_CODE = [
    "// Initialiseer Parameters",
    "t = 0",
    "dt = 0.01 // in seconds",
    "\n",
    "stop als t >= 10",
    "",
].join("\n");

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

function Modeling() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const location = useLocation();
    const presetId = (location.state as { presetId?: string } | null)?.presetId;
    const project = Projects.find((p) => p.id === presetId);

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
    const [savedWork] = useState(() => (project ? loadProjectWork(project.id) : null));
    const [code, setCode] = useState(savedWork?.code ?? DEFAULT_CODE);
    const [steps, setSteps] = useState(savedWork?.steps ?? "");
    // A new project starts with one empty graph
    const [graphs, setGraphs] = useState<GraphConfig[]>(() => savedWork?.graphs ?? [newGraph()]);
    // Media is loaded from this device after opening; mediaLoaded is false until then
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const mediaLoaded = useRef(!project);
    const editorRef = useRef<CodeEditorHandle>(null);
    const [wasmReady, setWasmReady] = useState(false);

    // Every change to a project is saved with it and counts as an edit
    function saveWork(changes: Partial<ProjectWork>) {
        if (!project) return;
        // Until the media files have loaded, keep the media that was saved before
        const media = mediaLoaded.current ? toSaved(mediaItems) : savedWork?.media ?? [];
        saveProjectWork(project.id, { code, steps, graphs, media, ...changes });
        markProjectEdited(project.id);
    }

    // The editor also reports values set from outside, so only real changes count as an edit
    function handleCodeChange(value: string) {
        if (value === code) return;
        setCode(value);
        saveWork({ code: value });
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

    // The first blank line (spaces allowed) separates the start values from the model rules.
    // modelLineOffset turns a model-block line number into a line number in the editor.
    function splitSource(source: string): { start: string; model: string; modelLineOffset: number } {
        const blank = /\n[ \t]*\n/.exec(source);
        if (!blank) return { start: source, model: "", modelLineOffset: 0 };
        const modelStart = blank.index + blank[0].length;
        return {
            start: source.slice(0, blank.index),
            model: source.slice(modelStart),
            modelLineOffset: source.slice(0, modelStart).split("\n").length - 1,
        };
    }

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
        const names = codeVariables(code);
        for (const name of [...measuredData.map((s) => s.name), ...(history?.[0]?.keys() ?? [])]) {
            if (!names.includes(name)) names.push(name);
        }
        return names;
    }, [code, history, measuredData]);

    // The measured points themselves, drawn as dots with the line of their variable when
    // the graph's X is t or the same video's other coordinate
    const markersFor = useCallback((x: string, y: string): ChartPoint[] => {
        for (const item of mediaItems) {
            if (item.category !== "video") continue;
            const [xName, yName] = [`x_${item.varName}`, `y_${item.varName}`];
            const pick = (axis: string): "t" | "x" | "y" | null =>
                axis === "t" ? "t" : axis === xName ? "x" : axis === yName ? "y" : null;
            const [px, py] = [pick(x), pick(y)];
            if (!px || !py || py === "t") continue;
            return item.points.map((p) => ({ x: px === "t" ? p.t ?? 0 : p[px], y: p[py] }));
        }
        return [];
    }, [mediaItems]);

    function runSimulation() {
        if (!wasmReady) {
            console.warn("wasm not ready yet");
            return;
        }
        editorRef.current?.clearErrors();

        const { start, model, modelLineOffset } = splitSource(code);
        console.log("start block:", JSON.stringify(start));
        console.log("model block:", JSON.stringify(model));

        const result = runInterpreter(start, model, stepCount(), measuredData) as RunResult;
        console.log("interpreter result:", result);

        if (!result.ok) {
            // Line numbers are relative to their own block; the model block starts after the blank line
            const errors: InterpreterError[] = result.errors.map((e) => ({
                line: e.block === "model" ? e.line + modelLineOffset : e.line,
                column: e.column,
                message: `[${e.block}] ${e.message}`,
            }));
            editorRef.current?.setErrors(errors);
            return;
        }

        console.log(`ran ${result.history.length} steps, final state:`, result.history[result.history.length - 1]);
        setHistory(result.history);
    }

    // ---------- Insert Media & Embeds ----------
    // Media, its points and settings are saved with the project; the files themselves in IndexedDB
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const mediaItemsRef = useRef<MediaItem[]>([]);

    useEffect(() => {
        mediaItemsRef.current = mediaItems;
    }, [mediaItems]);

    // Reopening a project brings back its media; a file missing on this device keeps its points
    useEffect(() => {
        if (!project) return;
        let cancelled = false;
        const saved = savedWork?.media ?? [];
        Promise.all(saved.map(async (media): Promise<MediaItem> => {
            const file = await loadMediaFile(mediaKey(project.id, media.id)).catch(() => undefined);
            return { ...media, url: file ? URL.createObjectURL(file) : "" };
        })).then((items) => {
            if (cancelled) {
                items.forEach((item) => item.url && URL.revokeObjectURL(item.url));
                return;
            }
            mediaLoaded.current = true;
            setMediaItems(items);
        });
        return () => {
            cancelled = true;
        };
    }, [project, savedWork]);

    // Revoke every blob URL on unmount so nothing leaks.
    useEffect(() => {
        return () => {
            mediaItemsRef.current.forEach((item) => item.url && URL.revokeObjectURL(item.url));
        };
    }, []);

    const panelCountRef = useRef(0);

    const openFilePicker = useCallback(() => {
        if (panelCountRef.current >= MAX_PANELS) return;
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
        if (project) saveMediaFile(mediaKey(project.id, newItem.id), file).catch((err) => console.error("couldn't save media", err));
    }

    function updateMediaItem(updated: MediaItem) {
        setMedia(mediaItems.map((item) => (item.id === updated.id ? updated : item)));
    }

    function removeMediaItem(id: string) {
        const target = mediaItems.find((item) => item.id === id);
        if (target?.url) URL.revokeObjectURL(target.url);
        setMedia(mediaItems.filter((item) => item.id !== id));
        if (project) deleteMediaFile(mediaKey(project.id, id)).catch(() => {});
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
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <NavBrand />
                    <div className="spacer"></div>
                    <h2>{ project?.title }</h2>
                </div>

                <div className="system-actions">
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
                            <img src={PlusIcon14px} alt="PlusIcon14px"/>
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
                    <button className="hand-in-btn" onClick={() => navigate("/dashboard")}>
                        <img src={arrowIcon14px} alt="ArrowIcon14px"/>
                        <p>{t("modeling.handInAssignment")}</p>
                    </button>
                    <div className="right-system-actions">
                        <button onClick={() => navigate("/settings")}>
                            <img src={SettingsIcon21px} alt="SettingsIcon21px"/>
                        </button>
                        <button onClick={() => navigate("/")}>
                            <img src={HelpIcon21px} alt="HelpIcon21px"/>
                        </button>
                    </div>
                </div>
            </div>

            <div className="content-modeling" ref={contentRef}>
                <div className="explanation-panel" style={{ flex: `0 0 ${panelWidths[0]}%` }}>
                    <div className="explanation">
                        <p>{ project?.explanation }</p>
                    </div>
                    <div className="explanation-footer">
                        <span>{t("modeling.estimatedTime")} <strong>{project?.estimatedTime} m</strong></span>
                        <span className="code-footer-dot">·</span>
                        <span>{t("modeling.equipment")} <strong>{project?.equipment ?? t("modeling.equipmentNone")}</strong></span>
                    </div>
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
                                <img src={PlayIcon20px} alt="PlayIcon20px"/>
                            </button>
                        </div>
                        <div className="code-editor">
                            <CodeEditor ref={editorRef} value={code} onChange={handleCodeChange} onRun={runSimulation}/>
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
                                                    <img src={CloseIcon20px} alt="CloseIcon20px"/>
                                                </button>
                                            </div>
                                            <Graph
                                                samples={history}
                                                variables={variables}
                                                x={row.graph.x}
                                                ys={row.graph.ys}
                                                onChange={(x, ys) => updateGraph(row.graph.id, x, ys)}
                                                markersFor={markersFor}
                                                runPrompt={t("modeling.chartRunPrompt")}
                                            />
                                        </div>
                                    ) : (
                                        <MediaTile
                                            item={row.item}
                                            style={rowStyle}
                                            onRemove={() => removeMediaItem(row.item.id)}
                                            onChange={updateMediaItem}
                                        />
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

export default Modeling;