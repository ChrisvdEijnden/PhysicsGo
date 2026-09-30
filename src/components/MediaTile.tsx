import { useEffect, useMemo, useRef, useState } from "react";

import PlayIcon20px from "../assets/icons/play-20px.svg";
import PlusIcon14px from "../assets/icons/plus-14px.svg";
import CloseIcon20px from "../assets/icons/close-20px.svg";
import UndoIcon16px from "../assets/icons/undo-16px.svg";
import TrashIcon16px from "../assets/icons/trash-16px.svg";
import Graph from "./Graph.tsx";
import ConfirmButton from "./ConfirmButton";
import type { LengthUnit, MediaPoint, SavedMedia } from "../data/Projects.tsx";
import { useTranslation } from "../lib/useTranslations";
import { realPoints, unitsPerPixel } from "../lib/calibration";
import ExportMenu from "./ExportMenu";
import { tableFromRows } from "../lib/samples";
import { toCsv } from "../lib/csv";
import type { CsvCell } from "../lib/csv";
import { downloadFile, fileNameFor } from "../lib/download";

// Saved media plus the URL of its file for this session ("" when the file isn't on this device)
export interface MediaItem extends SavedMedia {
    url: string;
}

export const DEFAULT_POINT_STEP = 1 / 30;

// Axes a media's points can be plotted on: photos have no time
export const pointAxes = (item: SavedMedia) => (item.category === "photo" ? ["x", "y"] : ["t", "x", "y"]);

// Only video points have a real time, so only they become variables in the code;
// they're in the media's calibrated units, or pixels without a calibration. With a calibration
// the pixel positions stay available too, as x_video1_px and y_video1_px.
export function pointSeries(item: SavedMedia) {
    if (item.category !== "video" || item.points.length === 0) return [];
    const byTime = <P extends MediaPoint>(points: P[]) => [...points].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
    const real = byTime(realPoints(item));
    const t = real.map((p) => p.t ?? 0);
    const series = [
        { name: `x_${item.varName}`, t, values: real.map((p) => p.x) },
        { name: `y_${item.varName}`, t, values: real.map((p) => p.y) },
    ];
    if (!item.calibration) return series;
    const pixels = byTime(item.points);
    return [
        ...series,
        { name: `x_${item.varName}_px`, t, values: pixels.map((p) => p.x) },
        { name: `y_${item.varName}_px`, t, values: pixels.map((p) => p.y) },
    ];
}

function DocumentGlyph() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 1.5H9L12.5 5V13.5C12.5 14.05 12.05 14.5 11.5 14.5H4.5C3.95 14.5 3.5 14.05 3.5 13.5V2.5C3.5 1.95 3.95 1.5 4 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M9 1.5V5H12.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M5.5 8.5H10.5M5.5 10.5H10.5M5.5 12H8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
        </svg>
    );
}

type VideoWithFrameCallback = HTMLVideoElement & {
    requestVideoFrameCallback?: (
        callback: (now: number, metadata: { presentedFrames?: number }) => void
    ) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
};

const round = (value: number, decimals: number) => Math.round(value * 10 ** decimals) / 10 ** decimals;

const UNITS: LengthUnit[] = ["m", "cm", "mm"];

// Setting a scale: click both ends of something of known length, type that length, then click the origin
type CalibrationStep = "ends" | "length" | "origin";

export default function MediaTile({
    item,
    style,
    onRemove,
    onChange,
    readOnly = false,
}: {
    item: MediaItem;
    style: React.CSSProperties;
    onRemove: () => void;
    // Called with the updated media whenever its points or settings change
    onChange: (item: MediaItem) => void;
    // Viewing someone else's work: the media and its points can be looked at, not changed
    readOnly?: boolean;
}) {
    const { t, language } = useTranslation();
    const isImage = item.mime.startsWith("image/");
    const isVideo = item.mime.startsWith("video/");
    const isLooping = item.category === "animation";
    const canPlot = item.category !== "document";
    const fileMissing = item.url === "";

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [frame, setFrame] = useState(0);
    const [timeSec, setTimeSec] = useState(0);
    const fallbackFpsRef = useRef(30);

    const [pointMode, setPointMode] = useState(false);
    const [showGraph, setShowGraph] = useState(false);
    // Size of the original file in pixels; points are stored in these coordinates
    const [size, setSize] = useState<{ width: number; height: number } | null>(null);
    const [stepDraft, setStepDraft] = useState(String(round(item.step, 4)));

    const [calibrating, setCalibrating] = useState<CalibrationStep | null>(null);
    // The reference line being drawn, in pixels with y up; b is missing until the second click
    const [ruler, setRuler] = useState<{ ax: number; ay: number; bx?: number; by?: number } | null>(null);
    const [lengthDraft, setLengthDraft] = useState("");
    const [unitDraft, setUnitDraft] = useState<LengthUnit>("m");
    const calibration = item.calibration ?? null;

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
    }, [isVideo, showGraph]);

    function togglePlay() {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) video.play();
        else video.pause();
    }

    function togglePointMode() {
        const next = !pointMode;
        setPointMode(next);
        if (next) {
            setShowGraph(false);
            setCalibrating(null);
            videoRef.current?.pause(); // points are plotted on a still frame
        }
    }

    function startCalibration() {
        setPointMode(false);
        setShowGraph(false);
        videoRef.current?.pause();
        setRuler(null);
        setLengthDraft(calibration ? String(calibration.length) : "");
        setUnitDraft(calibration?.unit ?? "m");
        setCalibrating("ends");
    }

    function cancelCalibration() {
        setCalibrating(null);
        setRuler(null);
    }

    function confirmLength() {
        const length = Number(lengthDraft.replace(",", "."));
        if (!(length > 0) || !ruler || ruler.bx === undefined) return;
        setCalibrating("origin");
    }

    function finishCalibration(originX: number, originY: number) {
        const length = Number(lengthDraft.replace(",", "."));
        if (!ruler || ruler.bx === undefined || ruler.by === undefined || !(length > 0)) return cancelCalibration();
        onChange({
            ...item,
            calibration: { ax: ruler.ax, ay: ruler.ay, bx: ruler.bx, by: ruler.by, length, unit: unitDraft, originX, originY },
        });
        cancelCalibration();
    }

    function removeCalibration() {
        onChange({ ...item, calibration: null });
        cancelCalibration();
    }

    // Click on the media: store the position in pixels of the original file, y up from the bottom
    function handlePlot(e: React.MouseEvent<SVGSVGElement>) {
        if ((!pointMode && calibrating !== "ends" && calibrating !== "origin") || !size) return;
        const svg = e.currentTarget;
        const matrix = svg.getScreenCTM();
        if (!matrix) return;
        const at = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
        // Clicks on the empty bands around the media don't count
        if (at.x < 0 || at.y < 0 || at.x > size.width || at.y > size.height) return;

        const x = round(at.x, 1);
        const y = round(size.height - at.y, 1);
        const video = videoRef.current;

        if (calibrating === "ends") {
            // Two ends make the reference line; a third click starts a new one
            if (!ruler || ruler.bx !== undefined) return setRuler({ ax: x, ay: y });
            if (ruler.ax === x && ruler.ay === y) return;
            setRuler({ ...ruler, bx: x, by: y });
            return setCalibrating("length");
        }
        if (calibrating === "origin") return finishCalibration(x, y);

        if (isVideo && video) {
            const time = round(video.currentTime, 4);
            // One point per moment: plotting again at the same frame replaces that point
            const points = item.points
                .filter((p) => Math.abs((p.t ?? 0) - time) >= item.step / 2)
                .concat({ t: time, x, y })
                .sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
            onChange({ ...item, points });
            // Some recordings (e.g. WebM) report no duration; seeking still works for them
            const next = time + item.step;
            video.currentTime = Number.isFinite(video.duration) ? Math.min(video.duration, next) : next;
        } else {
            const point: MediaPoint = { t: item.category === "animation" ? item.points.length : null, x, y };
            onChange({ ...item, points: [...item.points, point] });
        }
    }

    // The plotted points as a spreadsheet, named like the code's variables: in the calibrated unit,
    // with the pixel positions too once there's a scale; in time (or click) order
    function exportPoints() {
        const c = item.calibration;
        const unit = c ? c.unit : "px";
        const time = item.category === "video" ? "t (s)" : item.category === "animation" ? "n" : null;
        const headers = [
            ...(time ? [time] : []),
            `x_${item.varName} (${unit})`,
            `y_${item.varName} (${unit})`,
            ...(c ? [`x_${item.varName}_px`, `y_${item.varName}_px`] : []),
        ];
        const real = realPoints(item);
        const rows: CsvCell[][] = item.points
            .map((p, i) => ({ pixels: p, real: real[i] }))
            .sort((a, b) => (a.pixels.t ?? 0) - (b.pixels.t ?? 0))
            .map(({ pixels, real }) => [
                ...(time ? [real.t] : []),
                real.x,
                real.y,
                ...(c ? [pixels.x, pixels.y] : []),
            ]);
        const csv = toCsv(headers, rows, language);
        downloadFile(fileNameFor(`${item.name.replace(/\.[^.]+$/, "")} points`, "csv"), new Blob([csv], { type: "text/csv" }));
    }

    // Removes the most recently plotted point; for a video, steps back to its frame
    function undoPoint() {
        if (item.points.length === 0) return;
        const video = videoRef.current;
        if (isVideo && video) {
            const current = video.currentTime;
            // The point just before the current frame is the one plotted last when stepping forward
            const before = item.points.filter((p) => (p.t ?? 0) < current - item.step / 2);
            const last = before.length > 0 ? before[before.length - 1] : item.points[item.points.length - 1];
            onChange({ ...item, points: item.points.filter((p) => p !== last) });
            video.currentTime = last.t ?? 0;
        } else {
            onChange({ ...item, points: item.points.slice(0, -1) });
        }
    }

    function commitStep(value: string) {
        const step = Number(value);
        if (Number.isFinite(step) && step > 0) onChange({ ...item, step });
        else setStepDraft(String(round(item.step, 4)));
    }

    // Each plotted point as a sample for the graph (in calibrated units); photos have no time
    const graphSamples = useMemo(
        () => tableFromRows(realPoints(item).map((p) => new Map([...(p.t === null ? [] : [["t", p.t] as const]), ["x", p.x], ["y", p.y]]))),
        [item]
    );

    // Dots scale with the media, so size them relative to it
    const dotRadius = size ? Math.max(size.width, size.height) / 120 : 0;
    const currentPoint = isVideo
        ? item.points.find((p) => Math.abs((p.t ?? 0) - timeSec) < item.step / 2)
        : undefined;

    // The reference line: the one being drawn while calibrating, otherwise the saved one
    const shownRuler = calibrating ? ruler : calibration;
    const clicking = pointMode || calibrating === "ends" || calibrating === "origin";
    const axisLength = size ? Math.min(size.width, size.height) / 8 : 0;

    const overlay = size && (
        <svg
            className={`media-points${clicking ? " plotting" : ""}`}
            viewBox={`0 0 ${size.width} ${size.height}`}
            preserveAspectRatio="xMidYMid meet"
            onClick={handlePlot}
        >
            {shownRuler && (
                <g className="media-ruler">
                    {shownRuler.bx !== undefined && shownRuler.by !== undefined && (
                        <line x1={shownRuler.ax} y1={size.height - shownRuler.ay}
                              x2={shownRuler.bx} y2={size.height - shownRuler.by} strokeWidth={dotRadius / 2}/>
                    )}
                    <circle cx={shownRuler.ax} cy={size.height - shownRuler.ay} r={dotRadius}/>
                    {shownRuler.bx !== undefined && shownRuler.by !== undefined && (
                        <circle cx={shownRuler.bx} cy={size.height - shownRuler.by} r={dotRadius}/>
                    )}
                </g>
            )}
            {calibration && !calibrating && (
                <g className="media-origin" strokeWidth={dotRadius / 2}>
                    <line x1={calibration.originX} y1={size.height - calibration.originY}
                          x2={calibration.originX + axisLength} y2={size.height - calibration.originY}/>
                    <line x1={calibration.originX} y1={size.height - calibration.originY}
                          x2={calibration.originX} y2={size.height - calibration.originY - axisLength}/>
                    <text x={calibration.originX + axisLength} y={size.height - calibration.originY + dotRadius * 3}
                          fontSize={dotRadius * 3}>x</text>
                    <text x={calibration.originX - dotRadius * 3} y={size.height - calibration.originY - axisLength}
                          fontSize={dotRadius * 3}>y</text>
                </g>
            )}
            {item.points.length > 1 && (
                <polyline
                    className="media-points-path"
                    points={item.points.map((p) => `${p.x},${size.height - p.y}`).join(" ")}
                    strokeWidth={dotRadius / 2}
                />
            )}
            {item.points.map((p, i) => (
                <circle
                    key={`${p.t}-${i}`}
                    className={`media-point${p === currentPoint ? " current" : ""}`}
                    cx={p.x}
                    cy={size.height - p.y}
                    r={p === currentPoint ? dotRadius * 1.5 : dotRadius}
                />
            ))}
        </svg>
    );

    return (
        <div className="analysis-media" style={style}>
            <div className="analysis-media-actions">
                {isVideo && !showGraph && !fileMissing && (
                    <button
                        type="button"
                        className="analysis-media-play"
                        onClick={togglePlay}
                        aria-label={isPlaying ? t("modeling.pause") : t("modeling.play")}
                    >
                        {isPlaying ? <span className="pause-icon"/> : <img src={PlayIcon20px} alt=""/>}
                    </button>
                )}
                <div className="right-btns">
                    {canPlot && !fileMissing && !showGraph && !readOnly && (
                        <button
                            type="button"
                            className={`insert-points-btn${calibrating ? " active" : ""}`}
                            aria-pressed={calibrating !== null}
                            onClick={calibrating ? cancelCalibration : startCalibration}
                        >
                            <p>{t("modeling.calibrate")}</p>
                        </button>
                    )}
                    {canPlot && !fileMissing && !readOnly && (
                        <button
                            type="button"
                            className={`insert-points-btn${pointMode ? " active" : ""}`}
                            aria-pressed={pointMode}
                            onClick={togglePointMode}
                        >
                            {!pointMode && <img src={PlusIcon14px} alt=""/>}
                            <p>{pointMode ? t("modeling.pointsDone") : t("modeling.insertPoints")}</p>
                        </button>
                    )}
                    {canPlot && (
                        <button
                            type="button"
                            className={`insert-points-btn${showGraph ? " active" : ""}`}
                            aria-pressed={showGraph}
                            onClick={() => {
                                setShowGraph(!showGraph);
                                setPointMode(false);
                                cancelCalibration();
                            }}
                        >
                            <p>{showGraph ? t("modeling.showMedia") : t("modeling.showGraph")}</p>
                        </button>
                    )}
                    {canPlot && item.points.length > 0 && (
                        <ExportMenu label={t("modeling.export")} items={[
                            { label: t("modeling.exportPointsCsv"), onSelect: exportPoints },
                        ]}/>
                    )}
                    {!readOnly && <button
                        type="button"
                        className="analysis-media-remove"
                        onClick={onRemove}
                        aria-label={t("modeling.removeMedia", { name: item.name })}
                    >
                        <img src={CloseIcon20px} alt=""/>
                    </button>}
                </div>
            </div>

            {showGraph ? (
                <div className="media-graph">
                    <Graph
                        samples={graphSamples}
                        variables={pointAxes(item)}
                        x={item.graphX}
                        ys={item.graphYs}
                        onChange={(graphX, graphYs) => onChange({ ...item, graphX, graphYs })}
                        runPrompt={t("modeling.pointsGraphEmpty")}
                    />
                </div>
            ) : fileMissing ? (
                <div className="analysis-media-file">
                    <DocumentGlyph/>
                    <span>{t("modeling.mediaMissing", { name: item.name })}</span>
                </div>
            ) : isImage ? (
                <div className="media-stage">
                    <img
                        className="analysis-media-content"
                        src={item.url}
                        alt={item.name}
                        onLoad={(e) => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
                    />
                    {overlay}
                </div>
            ) : isVideo ? (
                <>
                    <div className="media-stage">
                        <video
                            ref={videoRef}
                            className="analysis-media-content"
                            src={item.url}
                            autoPlay={isLooping && !pointMode}
                            loop={isLooping}
                            muted={isLooping}
                            playsInline
                            onLoadedMetadata={(e) => setSize({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                        />
                        {overlay}
                    </div>
                </>
            ) : (
                <div className="analysis-media-file">
                    <DocumentGlyph/>
                    <span>{item.name}</span>
                </div>
            )}

            {/* Part of the panel, below the media, so nothing covers the picture */}
            {!showGraph && !fileMissing && (isVideo || pointMode || calibrating || calibration) && (
                <div className="analysis-footer media-footer">
                    {calibrating ? (
                        <div className="calibration-bar">
                            {calibrating === "ends" && <span>{t("modeling.calibrateEndsHint")}</span>}
                            {calibrating === "length" && (
                                <label className="points-step">
                                    {t("modeling.calibrateLength")}
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        autoFocus
                                        value={lengthDraft}
                                        onChange={(e) => setLengthDraft(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && confirmLength()}
                                    />
                                    <select
                                        className="calibration-unit"
                                        aria-label={t("modeling.calibrateUnit")}
                                        value={unitDraft}
                                        onChange={(e) => setUnitDraft(e.target.value as LengthUnit)}
                                    >
                                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </label>
                            )}
                            {calibrating === "length" && (
                                <button type="button" className="calibration-btn primary" onClick={confirmLength}
                                        disabled={!(Number(lengthDraft.replace(",", ".")) > 0)}>
                                    {t("modeling.calibrateNext")}
                                </button>
                            )}
                            {calibrating === "origin" && <span>{t("modeling.calibrateOriginHint")}</span>}
                            {calibrating === "origin" && (
                                <button type="button" className="calibration-btn" onClick={() => finishCalibration(0, 0)}>
                                    {t("modeling.calibrateCorner")}
                                </button>
                            )}
                            {calibration && calibrating === "ends" && (
                                <button type="button" className="calibration-btn" onClick={removeCalibration}>
                                    {t("modeling.calibrateRemove")}
                                </button>
                            )}
                            <button type="button" className="calibration-btn" onClick={cancelCalibration}>
                                {t("modeling.calibrateCancel")}
                            </button>
                        </div>
                    ) : (calibration || pointMode) && (
                        <span className="media-footer-scale">
                            {calibration
                                ? t("modeling.scaleInfo", {
                                    length: calibration.length,
                                    unit: calibration.unit,
                                    pixels: round(calibration.length / unitsPerPixel(calibration), 1),
                                })
                                : t("modeling.pixelsHint")}
                        </span>
                    )}
                    {isVideo && (
                        <span className="media-footer-time">
                            {t("modeling.frame")} <strong>{frame}</strong>
                            <span className="code-footer-dot"> · </span>
                            {t("modeling.time")} <strong>{timeSec.toFixed(2)}s</strong>
                        </span>
                    )}
                    {pointMode && (
                        <div className="points-bar">
                            <span>
                                {item.points.length === 1
                                    ? t("modeling.pointCountOne")
                                    : t("modeling.pointCount", { count: item.points.length })}
                            </span>
                            {isVideo && (
                                <label className="points-step">
                                    {t("modeling.pointStep")}
                                    <input
                                        type="number"
                                        min={0.001}
                                        step={0.001}
                                        value={stepDraft}
                                        onChange={(e) => setStepDraft(e.target.value)}
                                        onBlur={(e) => commitStep(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                                    />
                                    s
                                </label>
                            )}
                            <button
                                type="button"
                                className="points-icon-btn"
                                onClick={undoPoint}
                                disabled={item.points.length === 0}
                                aria-label={t("modeling.undoPoint")}
                                title={t("modeling.undoPoint")}
                            >
                                <img src={UndoIcon16px} alt=""/>
                            </button>
                            <ConfirmButton
                                className="points-icon-btn"
                                label={t("modeling.clearPoints")}
                                disabled={item.points.length === 0}
                                onConfirm={() => onChange({ ...item, points: [] })}
                            >
                                <img src={TrashIcon16px} alt=""/>
                            </ConfirmButton>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
