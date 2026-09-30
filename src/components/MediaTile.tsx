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
// Frame rate assumed for a video until the student sets it; browsers don't report it
const DEFAULT_FPS = 30;
const SPEEDS = [0.25, 0.5, 1];

// Points with a real time: a video's, or a stroboscopic photo's once it has the time between flashes
export const hasTime = (item: SavedMedia) => item.category === "video" || (item.category === "photo" && (item.interval ?? 0) > 0);

// Axes a media's points can be plotted on: an ordinary photo has no time
export const pointAxes = (item: SavedMedia) => (item.category === "photo" && !hasTime(item) ? ["x", "y"] : ["t", "x", "y"]);

// Only points with a real time become variables in the code; they're in the media's calibrated
// units, or pixels without a calibration. With a calibration the pixel positions stay available too,
// as x_video1_px and y_video1_px.
export function pointSeries(item: SavedMedia) {
    if (!hasTime(item) || item.points.length === 0) return [];
    // A photo's points are already in time order: the order they were plotted in
    const byTime = <P extends MediaPoint>(points: P[]) =>
        item.category === "photo" ? points : [...points].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
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
    // Position in the recording, in seconds, and its length (0 until known)
    const [timeSec, setTimeSec] = useState(0);
    const [duration, setDuration] = useState(0);
    // Frame numbers come from the time and the recording's frame rate, which the student can correct;
    // while playing, the rate the browser actually shows frames at is measured as a suggestion
    const fps = item.fps ?? DEFAULT_FPS;
    const frameAt = (time: number) => Math.floor(time * fps + 1e-6);
    const frame = frameAt(timeSec);
    // The time of the frame on screen, counted from t = 0: the same time a point plotted now gets
    const frameTime = frame / fps - (item.timeZero ?? 0);
    const [measuredFps, setMeasuredFps] = useState<number | null>(null);
    const [fpsDraft, setFpsDraft] = useState(String(fps));
    useEffect(() => setFpsDraft(String(fps)), [fps]);

    const [pointMode, setPointMode] = useState(false);
    const [showGraph, setShowGraph] = useState(false);
    // While plotting, an existing point can be selected (its index), then dragged, nudged or deleted
    const [selected, setSelected] = useState<number | null>(null);
    const [dragged, setDragged] = useState<{ index: number; x: number; y: number } | null>(null);
    const dragStart = useRef<{ clientX: number; clientY: number; moved: boolean } | null>(null);
    const editable = pointMode && !readOnly;
    const selectedPoint = selected !== null ? item.points[selected] : undefined;
    const [intervalDraft, setIntervalDraft] = useState(item.interval ? String(item.interval) : "");
    useEffect(() => setIntervalDraft(item.interval ? String(item.interval) : ""), [item.interval]);
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

        const update = () => setTimeSec(video.currentTime);
        // Recordings made in a browser (WebM) often don't say how long they are. Seeking far past the
        // end makes the browser find out; then it goes back to the start.
        let findingLength = false;
        const onMetadata = () => {
            if (video.duration === Infinity && !findingLength) {
                findingLength = true;
                video.currentTime = 1e9;
                return;
            }
            if (findingLength && Number.isFinite(video.duration)) {
                findingLength = false;
                video.currentTime = 0;
            }
            setDuration(Number.isFinite(video.duration) ? video.duration : 0);
            update();
        };
        video.addEventListener("seeked", update);
        video.addEventListener("timeupdate", update);
        video.addEventListener("loadedmetadata", onMetadata);
        video.addEventListener("durationchange", onMetadata);
        onMetadata();

        // Each shown frame updates the position; the gaps between frames while playing give the frame rate
        let rvfcId: number | null = null;
        const gaps: number[] = [];
        let lastMediaTime: number | null = null;
        if (typeof video.requestVideoFrameCallback === "function") {
            const onVideoFrame = (_now: number, metadata: { mediaTime?: number }) => {
                update();
                const mediaTime = metadata.mediaTime;
                if (mediaTime !== undefined && !video.paused && video.playbackRate === 1) {
                    if (lastMediaTime !== null && mediaTime > lastMediaTime) gaps.push(mediaTime - lastMediaTime);
                    lastMediaTime = mediaTime;
                    if (gaps.length === 20) {
                        const median = [...gaps].sort((a, b) => a - b)[10];
                        setMeasuredFps(Math.round(10 / median) / 10);
                    }
                } else {
                    lastMediaTime = null;
                }
                rvfcId = video.requestVideoFrameCallback!(onVideoFrame);
            };
            rvfcId = video.requestVideoFrameCallback!(onVideoFrame);
        }
        return () => {
            video.removeEventListener("seeked", update);
            video.removeEventListener("timeupdate", update);
            video.removeEventListener("loadedmetadata", onMetadata);
            video.removeEventListener("durationchange", onMetadata);
            if (rvfcId !== null) video.cancelVideoFrameCallback?.(rvfcId);
        };
    }, [isVideo, showGraph]);

    // Frame n is shown from n / fps until the next one; seeking to its middle avoids landing on the
    // previous frame through rounding
    function seekToFrame(n: number) {
        const video = videoRef.current;
        if (!video) return;
        video.pause();
        const last = duration > 0 ? frameAt(duration) : Infinity;
        const target = (Math.min(Math.max(n, 0), last) + 0.5) / fps;
        video.currentTime = duration > 0 ? Math.min(target, duration) : target;
    }

    // From the position just asked for, so quick key presses add up even before the seek has finished
    const stepFrames = (count: number) => seekToFrame(frameAt(videoRef.current?.currentTime ?? timeSec) + count);

    function commitFps(value: string) {
        const next = Number(value.replace(",", "."));
        if (next >= 1 && next <= 1000) onChange({ ...item, fps: round(next, 3) });
        else setFpsDraft(String(fps));
    }

    // The current frame becomes t = 0 for the points (and the variables made from them)
    function setTimeZero() {
        onChange({ ...item, timeZero: round(frame / fps, 4) });
    }

    function togglePlay() {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) video.play();
        else video.pause();
    }

    function togglePointMode() {
        const next = !pointMode;
        setPointMode(next);
        setSelected(null);
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

    // A position on screen in pixels of the original file, y up from the bottom; null outside the
    // media (on the empty bands around it), unless `clamp` pulls it back to the edge
    function mediaPosition(svg: SVGSVGElement, clientX: number, clientY: number, clamp = false) {
        const matrix = svg.getScreenCTM();
        if (!matrix || !size) return null;
        let { x, y } = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
        if (clamp) {
            x = Math.min(Math.max(x, 0), size.width);
            y = Math.min(Math.max(y, 0), size.height);
        }
        if (x < 0 || y < 0 || x > size.width || y > size.height) return null;
        return { x: round(x, 1), y: round(size.height - y, 1) };
    }

    // Click on the media: store the position in pixels of the original file, y up from the bottom
    function handlePlot(e: React.MouseEvent<SVGSVGElement>) {
        if ((!pointMode && calibrating !== "ends" && calibrating !== "origin") || !size) return;
        const at = mediaPosition(e.currentTarget, e.clientX, e.clientY);
        if (!at) return;
        const { x, y } = at;
        setSelected(null);
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
            // A point belongs to the frame on screen, at that frame's time
            const current = frameAt(video.currentTime);
            const time = round(current / fps, 4);
            // One point per frame: plotting again on the same frame replaces that point
            const points = item.points
                .filter((p) => frameAt(p.t ?? 0) !== current)
                .concat({ t: time, x, y })
                .sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
            onChange({ ...item, points });
            // On to the next frame to measure: the step, in whole frames
            seekToFrame(current + Math.max(1, Math.round(item.step * fps)));
        } else {
            const point: MediaPoint = { t: item.category === "animation" ? item.points.length : null, x, y };
            onChange({ ...item, points: [...item.points, point] });
        }
    }

    function movePoint(index: number, x: number, y: number) {
        onChange({ ...item, points: item.points.map((p, i) => (i === index ? { ...p, x, y } : p)) });
    }

    function deletePoint(index: number) {
        onChange({ ...item, points: item.points.filter((_, i) => i !== index) });
        setSelected(null);
    }

    // Pressing on a point selects it (a video goes to its frame); moving while pressed drags it
    function pointPointerDown(e: React.PointerEvent<SVGCircleElement>, index: number) {
        e.stopPropagation();
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        setSelected(index);
        dragStart.current = { clientX: e.clientX, clientY: e.clientY, moved: false };
        const t = item.points[index].t;
        if (isVideo && t !== null) seekToFrame(frameAt(t));
    }

    function pointPointerMove(e: React.PointerEvent<SVGCircleElement>, index: number) {
        const start = dragStart.current;
        const svg = e.currentTarget.ownerSVGElement;
        if (!start || !svg) return;
        // A little wobble while clicking isn't a drag
        if (!start.moved && Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) < 3) return;
        start.moved = true;
        const at = mediaPosition(svg, e.clientX, e.clientY, true);
        if (at) setDragged({ index, ...at });
    }

    function pointPointerUp() {
        if (dragStart.current?.moved && dragged) movePoint(dragged.index, dragged.x, dragged.y);
        dragStart.current = null;
        setDragged(null);
    }

    // A selected point: arrow keys nudge it a pixel (ten with Shift), Delete removes it
    function pointKeyDown(e: React.KeyboardEvent<SVGCircleElement>, index: number) {
        const p = item.points[index];
        const step = e.shiftKey ? 10 : 1;
        const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (moves[e.key] && size) {
            e.preventDefault();
            e.stopPropagation();
            const [dx, dy] = moves[e.key];
            movePoint(index, round(Math.min(Math.max(p.x + dx, 0), size.width), 1), round(Math.min(Math.max(p.y + dy, 0), size.height), 1));
        } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            e.stopPropagation();
            deletePoint(index);
        } else if (e.key === "Escape") {
            e.stopPropagation();
            setSelected(null);
            e.currentTarget.blur();
        }
    }

    function commitInterval(value: string) {
        const next = Number(value.replace(",", "."));
        if (value.trim() === "") onChange({ ...item, interval: undefined });
        else if (next > 0 && next <= 3600) onChange({ ...item, interval: next });
        else setIntervalDraft(item.interval ? String(item.interval) : "");
    }

    // The plotted points as a spreadsheet, named like the code's variables: in the calibrated unit,
    // with the pixel positions too once there's a scale; in time (or click) order
    function exportPoints() {
        const c = item.calibration;
        const unit = c ? c.unit : "px";
        const time = item.category === "animation" ? "n" : hasTime(item) ? "t (s)" : null;
        const headers = [
            ...(time ? [time] : []),
            `x_${item.varName} (${unit})`,
            `y_${item.varName} (${unit})`,
            ...(c ? [`x_${item.varName}_px`, `y_${item.varName}_px`] : []),
        ];
        const real = realPoints(item);
        const rows: CsvCell[][] = item.points
            .map((p, i) => ({ pixels: p, real: real[i] }))
            .sort((a, b) => (a.real.t ?? 0) - (b.real.t ?? 0))
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

    // Where each point is drawn: where it's being dragged to, or where it is
    const shownPoints = item.points.map((p, i) => (dragged?.index === i ? { ...p, x: dragged.x, y: dragged.y } : p));

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
            {shownPoints.length > 1 && (
                <polyline
                    className="media-points-path"
                    points={shownPoints.map((p) => `${p.x},${size.height - p.y}`).join(" ")}
                    strokeWidth={dotRadius / 2}
                />
            )}
            {shownPoints.map((p, i) => {
                const emphasised = item.points[i] === currentPoint || i === selected;
                return (
                    <circle
                        key={`${item.points[i].t}-${i}`}
                        className={`media-point${item.points[i] === currentPoint ? " current" : ""}${i === selected ? " selected" : ""}`}
                        cx={p.x}
                        cy={size.height - p.y}
                        r={emphasised ? dotRadius * 1.5 : dotRadius}
                        {...(editable && {
                            tabIndex: 0,
                            role: "button",
                            "aria-label": t("modeling.pointLabel", { n: i + 1, x: p.x, y: p.y }),
                            onPointerDown: (e: React.PointerEvent<SVGCircleElement>) => pointPointerDown(e, i),
                            onPointerMove: (e: React.PointerEvent<SVGCircleElement>) => pointPointerMove(e, i),
                            onPointerUp: pointPointerUp,
                            onPointerCancel: pointPointerUp,
                            // The press already selected it; it mustn't also plot a new point underneath
                            onClick: (e: React.MouseEvent) => e.stopPropagation(),
                            onFocus: () => setSelected(i),
                            onKeyDown: (e: React.KeyboardEvent<SVGCircleElement>) => pointKeyDown(e, i),
                        })}
                    />
                );
            })}
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
                        fit={item.graphFit}
                        samplesMeasured
                        onChange={(graphX, graphYs) => onChange({ ...item, graphX, graphYs })}
                        onFitChange={(graphFit) => onChange({ ...item, graphFit })}
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
                    {/* Focusable, so ← and → step through the frames and space plays or pauses */}
                    <div
                        className="media-stage"
                        tabIndex={fileMissing ? undefined : 0}
                        aria-label={t("modeling.videoStage", { name: item.name })}
                        onKeyDown={(e) => {
                            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                                e.preventDefault();
                                stepFrames(e.key === "ArrowLeft" ? -1 : 1);
                            } else if (e.key === " ") {
                                e.preventDefault();
                                togglePlay();
                            }
                        }}
                    >
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

            {/* Going through a video frame by frame: buttons, a slider (whose arrow keys step one frame),
                playback speed, the frame rate, and which frame is t = 0 */}
            {isVideo && !showGraph && !fileMissing && (
                <div className="video-timeline">
                    <button type="button" className="points-icon-btn" onClick={() => stepFrames(-1)}
                            aria-label={t("modeling.previousFrame")} title={t("modeling.previousFrame")}>
                        ◀
                    </button>
                    <input
                        type="range"
                        className="video-slider"
                        min={0}
                        max={duration > 0 ? frameAt(duration) : 0}
                        step={1}
                        value={frame}
                        onChange={(e) => seekToFrame(Number(e.target.value))}
                        aria-label={t("modeling.videoPosition")}
                        aria-valuetext={t("modeling.videoPositionValue", { frame, time: frameTime.toFixed(3) })}
                    />
                    <button type="button" className="points-icon-btn" onClick={() => stepFrames(1)}
                            aria-label={t("modeling.nextFrame")} title={t("modeling.nextFrame")}>
                        ▶
                    </button>
                    <select
                        className="calibration-unit"
                        aria-label={t("modeling.playbackSpeed")}
                        title={t("modeling.playbackSpeed")}
                        defaultValue="1"
                        onChange={(e) => {
                            if (videoRef.current) videoRef.current.playbackRate = Number(e.target.value);
                        }}
                    >
                        {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
                    </select>
                    <label className="points-step" title={t("modeling.fpsHint")}>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={fpsDraft}
                            disabled={readOnly}
                            onChange={(e) => setFpsDraft(e.target.value)}
                            onBlur={(e) => commitFps(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        />
                        fps
                    </label>
                    {!readOnly && measuredFps !== null && Math.abs(measuredFps - fps) > 0.5 && (
                        <button type="button" className="calibration-btn" onClick={() => onChange({ ...item, fps: measuredFps })}>
                            {t("modeling.useMeasuredFps", { fps: measuredFps })}
                        </button>
                    )}
                    {!readOnly && (
                        <button type="button" className="calibration-btn" onClick={setTimeZero}
                                title={t("modeling.setTimeZeroHint")}>
                            {t("modeling.setTimeZero")}
                        </button>
                    )}
                    {!readOnly && (item.timeZero ?? 0) !== 0 && (
                        <button type="button" className="calibration-btn" onClick={() => onChange({ ...item, timeZero: 0 })}>
                            {t("modeling.resetTimeZero", { frame: frameAt(item.timeZero ?? 0) })}
                        </button>
                    )}
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
                            {t("modeling.time")} <strong>{frameTime.toFixed(3)} s</strong>
                        </span>
                    )}
                    {pointMode && (
                        <div className="points-bar">
                            <span>
                                {item.points.length === 1
                                    ? t("modeling.pointCountOne")
                                    : t("modeling.pointCount", { count: item.points.length })}
                            </span>
                            {item.category === "photo" && (
                                <label className="points-step" title={t("modeling.strobeHint")}>
                                    Δt
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="–"
                                        aria-label={t("modeling.strobeInterval")}
                                        value={intervalDraft}
                                        onChange={(e) => setIntervalDraft(e.target.value)}
                                        onBlur={(e) => commitInterval(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                                    />
                                    s
                                </label>
                            )}
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
                            {selectedPoint && selected !== null && (
                                <button type="button" className="calibration-btn" onClick={() => deletePoint(selected)}>
                                    {t("modeling.deletePoint", { n: selected + 1 })}
                                </button>
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
