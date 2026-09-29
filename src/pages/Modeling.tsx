import init, { run as runInterpreter } from "../wasm/interpreterGo";
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

import LineChart from "../components/lineChart.tsx";
import {Projects, markProjectEdited, loadProjectWork, saveProjectWork} from "../data/Projects.tsx";
import {minRangeLineData, maxRangeLineData, minDomainLineData, maxDomainLineData} from "../data/chartData.tsx";
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
// The interpreter keeps every step in memory, so very large runs would freeze the app
const MAX_STEPS = 1_000_000;

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

type MediaCategory = "photo" | "video" | "animation" | "document";

interface MediaItem {
    id: string;
    category: MediaCategory;
    name: string;
    url: string;
    mime: string;
}

type AnalysisRow = { kind: "chart" } | { kind: "media"; item: MediaItem };

const MAX_MEDIA_ITEMS = 2;

const ACCEPT_BY_CATEGORY: Record<MediaCategory, string> = {
    photo: "image/*",
    video: "video/*",
    animation: "image/gif,video/mp4,video/webm",
    document: ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function DocumentGlyph() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 1.5H9L12.5 5V13.5C12.5 14.05 12.05 14.5 11.5 14.5H4.5C3.95 14.5 3.5 14.05 3.5 13.5V2.5C3.5 1.95 3.95 1.5 4 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M9 1.5V5H12.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M5.5 8.5H10.5M5.5 10.5H10.5M5.5 12H8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
        </svg>
    );
}

function inferMediaCategory(file: File): MediaCategory {
    if (file.type === "image/gif") return "animation";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("image/")) return "photo";
    return "document";
}

const ALL_MEDIA_ACCEPT = Object.values(ACCEPT_BY_CATEGORY).join(",");

type VideoWithFrameCallback = HTMLVideoElement & {
    requestVideoFrameCallback?: (
        callback: (now: number, metadata: { presentedFrames?: number }) => void
    ) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
};

function MediaTile({
                       item,
                       style,
                       onRemove,
                   }: {
    item: MediaItem;
    style: React.CSSProperties;
    onRemove: () => void;
}) {
    const { t } = useTranslation();
    const isImage = item.mime.startsWith("image/");
    const isVideo = item.mime.startsWith("video/");
    const isLooping = item.category === "animation";

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [frame, setFrame] = useState(0);
    const [timeSec, setTimeSec] = useState(0);
    const fallbackFpsRef = useRef(30);

    useEffect(() => {
        if (!isVideo) return;
        const video = videoRef.current as VideoWithFrameCallback | null;
        if (!video) return;

        const supportsRVFC = typeof video.requestVideoFrameCallback === "function";
        let rvfcId: number | null = null;

        if (supportsRVFC) {
            const onVideoFrame = (_now: number, metadata: { presentedFrames?: number }) => {
                setFrame(metadata.presentedFrames ?? Math.round(video.currentTime * fallbackFpsRef.current));
                setTimeSec(Math.round(video.currentTime * 100) / 100);
                rvfcId = video.requestVideoFrameCallback!(onVideoFrame);
            };
            rvfcId = video.requestVideoFrameCallback!(onVideoFrame);
            return () => {
                if (rvfcId !== null) video.cancelVideoFrameCallback?.(rvfcId);
            };
        }

        const onTimeUpdate = () => {
            setFrame(Math.round(video.currentTime * fallbackFpsRef.current));
            setTimeSec(Math.ceil(video.currentTime * 100) / 100);
        };
        video.addEventListener("timeupdate", onTimeUpdate);
        return () => video.removeEventListener("timeupdate", onTimeUpdate);
    }, [isVideo]);

    function togglePlay() {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) video.play();
        else video.pause();
    }

    return (
        <div className="analysis-media" style={style}>
            <div className="analysis-media-actions">
                {isVideo && (
                    <button
                        type="button"
                        className="analysis-media-play"
                        onClick={togglePlay}
                        aria-label={isPlaying ? t("modeling.pause") : t("modeling.play")}
                    >
                        {isPlaying ? <span className="pause-icon"/> : <img src={PlayIcon20px} alt="PlayIcon20px"/>}
                    </button>
                )}
                <div className="right-btns">
                    <button className="insert-points-btn">
                        <img src={PlusIcon14px} alt="PlusIcon14px"/>
                        <p>{t("modeling.insertPoints")}</p>
                    </button>
                    <button
                        type="button"
                        className="analysis-media-remove"
                        onClick={onRemove}
                        aria-label={t("modeling.removeMedia", { name: item.name })}
                    >
                        <img src={CloseIcon20px} alt="CloseIcon20px"/>
                    </button>
                </div>
            </div>
            {isImage ? (
                <img className="analysis-media-content" src={item.url} alt={item.name}/>
            ) : isVideo ? (
                <>
                    <video
                        ref={videoRef}
                        className="analysis-media-content"
                        src={item.url}
                        autoPlay={isLooping}
                        loop={isLooping}
                        muted={isLooping}
                        playsInline
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                    />
                    <span className="analysis-media-framecount">
                        {t("modeling.frame")} <strong>{frame}</strong>
                        <span className="code-footer-dot"> · </span>
                        {t("modeling.time")} <strong>{timeSec.toFixed(2)}s</strong>
                    </span>
                </>
            ) : (
                <div className="analysis-media-file">
                    <DocumentGlyph/>
                    <span>{item.name}</span>
                </div>
            )}
        </div>
    );
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
    const editorRef = useRef<CodeEditorHandle>(null);
    const [wasmReady, setWasmReady] = useState(false);

    // The editor also reports values set from outside, so only real changes count as an edit
    function handleCodeChange(value: string) {
        if (value === code) return;
        setCode(value);
        if (project) {
            saveProjectWork(project.id, { code: value, steps });
            markProjectEdited(project.id);
        }
    }

    function handleStepsChange(value: string) {
        setSteps(value);
        if (project) {
            saveProjectWork(project.id, { code, steps: value });
            markProjectEdited(project.id);
        }
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

    function splitSource(source: string): { start: string; model: string } {
        const blankAt = source.indexOf("\n\n");
        return blankAt === -1
            ? { start: source, model: "" }
            : { start: source.slice(0, blankAt), model: source.slice(blankAt + 2) };
    }

    interface RunResult {
        ok: boolean;
        history: Record<string, number>[];
        errors: { line: number; column: number; message: string; block: string }[];
    }

    function runSimulation() {
        if (!wasmReady) {
            console.warn("wasm not ready yet");
            return;
        }
        editorRef.current?.clearErrors();

        const { start, model } = splitSource(code);
        console.log("start block:", JSON.stringify(start));
        console.log("model block:", JSON.stringify(model));

        const result = runInterpreter(start, model, stepCount()) as RunResult;
        console.log("interpreter result:", result);

        if (!result.ok) {
            const errors: InterpreterError[] = result.errors.map((e) => ({
                line: e.line,
                column: e.column,
                message: `[${e.block}] ${e.message}`,
            }));
            editorRef.current?.setErrors(errors);
            return;
        }

        console.log(`ran ${result.history.length} steps, final state:`, result.history[result.history.length - 1]);
    }

    // ---------- Insert Media & Embeds ----------
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const mediaItemsRef = useRef<MediaItem[]>([]);

    useEffect(() => {
        mediaItemsRef.current = mediaItems;
    }, [mediaItems]);

    // Revoke every blob URL on unmount so nothing leaks.
    useEffect(() => {
        return () => {
            mediaItemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
        };
    }, []);

    const openFilePicker = useCallback(() => {
        if (mediaItemsRef.current.length >= MAX_MEDIA_ITEMS) return;
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

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow picking the same file again later

        if (!file || mediaItems.length >= MAX_MEDIA_ITEMS) return;

        const newItem: MediaItem = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            category: inferMediaCategory(file),
            name: file.name,
            url: URL.createObjectURL(file),
            mime: file.type,
        };
        setMediaItems((prev) => [...prev, newItem]);
        if (project) markProjectEdited(project.id);
    }

    function removeMediaItem(id: string) {
        if (project) markProjectEdited(project.id);
        setMediaItems((prev) => {
            const target = prev.find((item) => item.id === id);
            if (target) URL.revokeObjectURL(target.url);
            return prev.filter((item) => item.id !== id);
        });
    }

    // ---------- analysis panel rows (chart + inserted media) ----------
    const [showChart, setShowChart] = useState(true);

    function closeChart() {
        setShowChart(false);
    }

    const rows: AnalysisRow[] = useMemo(
        () => [
            ...(showChart ? [{ kind: "chart" as const }] : []),
            ...mediaItems.slice(0, MAX_MEDIA_ITEMS).map((item) => ({ kind: "media" as const, item })),
        ],
        [mediaItems, showChart]
    );

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

    const atMediaCap = mediaItems.length >= MAX_MEDIA_ITEMS;

    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <NavBrand />
                    <div className="spacer"></div>
                    <h2>{ project?.title }</h2>
                </div>

                <div className="system-actions">
                    <button
                        type="button"
                        className="insert-media-btn"
                        onClick={openFilePicker}
                        disabled={atMediaCap}
                        title={atMediaCap ? t("modeling.removePanelTooltip") : "\u2318O / Ctrl+O"}
                        aria-keyshortcuts="Meta+O Control+O"
                    >
                        <img src={PlusIcon14px} alt="PlusIcon14px"/>
                        <p>{t("modeling.insertMediaEmbeds")}</p>
                    </button>
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
                            const key = row.kind === "chart" ? "chart" : row.item.id;
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
                                    {row.kind === "chart" ? (
                                        <div className="analysis" style={rowStyle}>
                                            <div className="analysis-panel-actions">
                                                <button className="insert-points-btn">
                                                    <img src={PlusIcon14px} alt="PlusIcon14px"/>
                                                    <p>{t("modeling.insertPoints")}</p>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="analysis-media-remove"
                                                    onClick={closeChart}
                                                    aria-label={t("modeling.closeGraph")}
                                                >
                                                    <img src={CloseIcon20px} alt="CloseIcon20px"/>
                                                </button>
                                            </div>
                                            <LineChart/>
                                            <div className="analysis-footer">
                                                <span>{t("modeling.domain")} <strong> [{minDomainLineData}, {maxDomainLineData}]</strong></span>
                                                <span className="code-footer-dot">·</span>
                                                <span>{t("modeling.range")} <strong>[{minRangeLineData}, {maxRangeLineData}]</strong></span>
                                            </div>
                                        </div>

                                    ) : (
                                        <MediaTile item={row.item} style={rowStyle} onRemove={() => removeMediaItem(row.item.id)}/>
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