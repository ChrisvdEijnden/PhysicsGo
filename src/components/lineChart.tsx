import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    LineChart as RechartsLineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";

import { withUnit } from "../lib/units";
import { useTranslation } from "../lib/useTranslations";

export interface ChartPoint {
    x: number;
    y: number;
}

// One row per sample: the shared x value, plus each line's value under that line's key
// (missing where the line has no value, which leaves a gap)
export type ChartRow = { x: number } & Record<string, number | undefined>;

// Which Y axis a line is read against: the left one, or a second one on the right (e.g. for a
// quantity of another size or unit)
export type ChartAxis = "left" | "right";

export interface ChartLine {
    key: string;
    label: string;
    color: string;
    unit?: string;
    axis?: ChartAxis;
}

// Separate dots drawn in a line's colour, e.g. measured points to compare with the line
export interface ChartMarkers {
    key: string;
    label: string;
    color: string;
    points: ChartPoint[];
    unit?: string;
    axis?: ChartAxis;
}

// A dashed curve through its own points, e.g. a fit; it doesn't widen the axes
export interface ChartCurve {
    key: string;
    color: string;
    points: ChartPoint[];
    axis?: ChartAxis;
}

type Domain = [number, number];

// An axis title: the quantities' names and their shared unit, like "x, y (m)". Lines with different
// units get none (the legend has each one's); a title too long for the axis keeps only the unit.
function axisTitle(lines: ChartLine[]): string | undefined {
    if (lines.length === 0) return undefined;
    const units = new Set(lines.map((l) => l.unit ?? ""));
    if (units.size !== 1) return undefined;
    const [unit] = units;
    const full = withUnit(lines.map((l) => l.label).join(", "), unit || undefined);
    return full.length <= 28 ? full : unit ? `(${unit})` : undefined;
}

// Axes shown while there is nothing to plot yet
const EMPTY_DOMAIN: Domain = [0, 10];

function extent(values: number[]): Domain {
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min)) return EMPTY_DOMAIN;
    // A constant variable would collapse the axis to a single value
    return min === max ? [min - 1, max + 1] : [min, max];
}

// Axis titles: centred along the axis, in the app's font (colour in modeling.css)
const TITLE = { className: "chart-axis-title", style: { textAnchor: "middle", fontFamily: "Figtree, sans-serif" } } as const;

const NO_MARKERS: ChartMarkers[] = [];
const NO_CURVES: ChartCurve[] = [];

export default function LineChart({ rows, lines, markers = NO_MARKERS, curves = NO_CURVES, xLabel, xUnit, emptyMessage }: {
    rows: ChartRow[];
    // Drawn in order through the rows, one per Y variable
    lines: ChartLine[];
    markers?: ChartMarkers[];
    curves?: ChartCurve[];
    xLabel: string;
    xUnit?: string;
    emptyMessage: string;
}) {
    const { t } = useTranslation();
    // The right axis is only used next to the left one: lines all on the right are shown on the left
    const twoAxes = lines.some((l) => l.axis === "right") && lines.some((l) => l.axis !== "right");
    const axisOf = useCallback((item: { axis?: ChartAxis }): ChartAxis => (twoAxes && item.axis === "right" ? "right" : "left"), [twoAxes]);

    // Every plotted (x, y) pair per Y axis, used to size the axes
    const plotted = useMemo(() => {
        const pairs: Record<ChartAxis, ChartPoint[]> = { left: [], right: [] };
        for (const row of rows) {
            for (const line of lines) {
                const y = row[line.key];
                if (y !== undefined) pairs[axisOf(line)].push({ x: row.x, y });
            }
        }
        for (const m of markers) pairs[axisOf(m)].push(...m.points);
        return pairs;
    }, [rows, lines, markers, axisOf]);
    const all = useMemo(() => [...plotted.left, ...plotted.right], [plotted]);

    const isEmpty = all.length === 0;
    const [xMin, xMax] = useMemo(() => extent(all.map((p) => p.x)), [all]);
    const fullSpan = xMax - xMin;
    // Narrowest allowed zoom window, as a fraction of the full range — keeps you
    // from zooming into a span with nothing visibly left to look at.
    const minSpan = fullSpan * 0.1;

    const [domain, setDomain] = useState<Domain>([xMin, xMax]);
    const chartAreaRef = useRef<HTMLDivElement | null>(null);

    // New data (another run or other axes) starts fully zoomed out
    useEffect(() => {
        setDomain([xMin, xMax]);
    }, [xMin, xMax]);

    // Shrinks or grows the visible domain by a proportional (not rounded) step,
    // keeping the value at `pivotFraction` (0 = left edge, 1 = right edge)
    // stationary.
    const applyZoom = useCallback((pivotFraction: number, zoomingIn: boolean) => {
        setDomain(([lo, hi]) => {
            const span = hi - lo;
            const step = span * 0.2;
            let newSpan = zoomingIn ? span - step : span + step;
            newSpan = Math.max(minSpan, Math.min(fullSpan, newSpan));

            const pivotValue = lo + pivotFraction * span;
            let newLo = pivotValue - pivotFraction * newSpan;
            let newHi = newLo + newSpan;

            if (newLo < xMin) {
                newHi += xMin - newLo;
                newLo = xMin;
            }
            if (newHi > xMax) {
                newLo -= newHi - xMax;
                newHi = xMax;
            }
            return [Math.max(xMin, newLo), Math.min(xMax, newHi)];
        });
    }, [minSpan, fullSpan, xMin, xMax]);

    // Scroll-to-zoom, centered on the cursor. Attached as a native, non-passive
    // listener so preventDefault() reliably stops the page from scrolling too
    // (React's onWheel is passive by default and can't stop that on its own).
    // Double-click resets back to the full range, since there's no reset button.
    useEffect(() => {
        const el = chartAreaRef.current;
        if (!el || isEmpty) return;

        function handleWheel(e: WheelEvent) {
            e.preventDefault();
            const rect = el!.getBoundingClientRect();
            const pivotFraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            applyZoom(pivotFraction, e.deltaY < 0);
        }

        function handleDoubleClick() {
            setDomain([xMin, xMax]);
        }

        el.addEventListener("wheel", handleWheel, { passive: false });
        el.addEventListener("dblclick", handleDoubleClick);
        return () => {
            el.removeEventListener("wheel", handleWheel);
            el.removeEventListener("dblclick", handleDoubleClick);
        };
    }, [applyZoom, isEmpty, xMin, xMax]);

    // Each Y axis rescales to its points inside the zoomed-in x-range, with a floor on the span so a
    // flat or narrow window doesn't collapse it
    const yScale = useMemo(() => {
        const scale = (points: ChartPoint[]) => {
            if (points.length === 0) return niceScale(...EMPTY_DOMAIN);
            const [lo, hi] = domain;
            const visible = points.filter((p) => p.x >= lo && p.x <= hi).map((p) => p.y);
            let [min, max] = extent(visible.length > 0 ? visible : points.map((p) => p.y));

            const [fullMin, fullMax] = extent(points.map((p) => p.y));
            const floor = (fullMax - fullMin) * 0.05;
            if (max - min < floor) {
                const mid = (max + min) / 2;
                min = mid - floor / 2;
                max = mid + floor / 2;
            }

            const padding = (max - min) * 0.1;
            return niceScale(min - padding, max + padding);
        };
        return { left: scale(plotted.left), right: scale(plotted.right) };
    }, [domain, plotted]);

    const byKey = useMemo(() => new Map(lines.map((l) => [l.key, l])), [lines]);
    const titles = {
        x: xLabel ? withUnit(xLabel, xUnit) : undefined,
        left: axisTitle(lines.filter((l) => axisOf(l) === "left")),
        right: axisTitle(lines.filter((l) => axisOf(l) === "right")),
    };
    // Wide enough for the longest tick label, so "-3.0e-6" isn't cut off at the edge, and the title
    const axisWidth = (axis: ChartAxis) =>
        Math.max(48, ...yScale[axis].ticks.map((tick) => formatTick(tick).length * 7 + 10)) + (titles[axis] ? 16 : 0);
    const yWidth = axisWidth("left");
    const valueText = (value: number, unit: string | undefined) => (unit ? `${formatTick(value)} ${unit}` : formatTick(value));

    return (
        <div className="chart-area" ref={chartAreaRef}>
            {isEmpty && <p className="chart-empty">{emptyMessage}</p>}
            <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart
                    data={rows}
                    // With a right axis, its top value stays clear of the panel's buttons
                    margin={{
                        top: twoAxes ? 24 : 0,
                        right: 0,
                        bottom: 0,
                        left: 0,
                    }}
                >
                    {/* Grid and axis colours come from the theme (modeling.css) */}
                    <CartesianGrid/>

                    <XAxis
                        type="number"
                        dataKey="x"
                        name={xLabel}
                        domain={isEmpty ? EMPTY_DOMAIN : domain}
                        allowDataOverflow
                        tickFormatter={formatTick}
                        height={titles.x ? 42 : 30}
                        label={titles.x ? { value: titles.x, position: "insideBottom", ...TITLE } : undefined}
                        fontSize="13"
                        fontFamily="Figtree"
                    />
                    <YAxis
                        yAxisId="left"
                        type="number"
                        width={yWidth}
                        tickMargin={4}
                        domain={yScale.left.domain}
                        ticks={yScale.left.ticks}
                        allowDataOverflow
                        tickFormatter={formatTick}
                        label={titles.left ? { value: titles.left, angle: -90, position: "insideLeft", ...TITLE } : undefined}
                        fontSize="13"
                        fontFamily="Figtree"
                    />
                    {twoAxes && (
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            type="number"
                            width={axisWidth("right")}
                            tickMargin={4}
                            domain={yScale.right.domain}
                            ticks={yScale.right.ticks}
                            allowDataOverflow
                            tickFormatter={formatTick}
                            label={titles.right ? { value: titles.right, angle: 90, position: "insideRight", ...TITLE } : undefined}
                            fontSize="13"
                            fontFamily="Figtree"
                        />
                    )}

                    {!isEmpty && (
                        <Tooltip
                            formatter={(value, key) => {
                                const line = byKey.get(String(key));
                                return [valueText(Number(value), line?.unit), line?.label ?? String(key)];
                            }}
                            labelFormatter={(value) => `${xLabel} = ${valueText(Number(value), xUnit)}`}
                            contentStyle={{
                                fontSize: "13px",
                                fontFamily: "Figtree, sans-serif",
                                backgroundColor: "var(--color-bg-surface)",
                                borderColor: "var(--color-border)",
                                color: "var(--color-text-primary)",
                            }}
                            labelStyle={{
                                fontSize: "13px",
                                fontWeight: 600,
                            }}
                            itemStyle={{
                                fontSize: "13px",
                            }}
                        />
                    )}

                    {lines.map((line) => (
                        <Line
                            key={line.key}
                            yAxisId={axisOf(line)}
                            type="linear"
                            dataKey={line.key}
                            name={line.key}
                            stroke={line.color}
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                        />
                    ))}
                    {curves.map((c) => (
                        <Line
                            key={`curve-${c.key}`}
                            yAxisId={axisOf(c)}
                            data={c.points}
                            type="linear"
                            dataKey="y"
                            stroke={c.color}
                            strokeWidth={1.5}
                            strokeDasharray="5 4"
                            dot={false}
                            activeDot={false}
                            tooltipType="none"
                            legendType="none"
                            isAnimationActive={false}
                        />
                    ))}
                    {markers.map((m) => (
                        <Line
                            key={`markers-${m.key}`}
                            yAxisId={axisOf(m)}
                            data={m.points}
                            type="linear"
                            dataKey="y"
                            name={m.label}
                            stroke="none"
                            dot={{ r: 3, fill: m.color, stroke: "var(--color-bg-surface)", strokeWidth: 1 }}
                            activeDot={false}
                            tooltipType="none"
                            legendType="none"
                            isAnimationActive={false}
                        />
                    ))}
                </RechartsLineChart>
            </ResponsiveContainer>
            {/* Which colour is which quantity, inside the plot's top-left corner */}
            {!isEmpty && lines.length > 0 && (
                <ul className="chart-legend" style={{ left: yWidth + 8 }} aria-label={t("modeling.legend")}>
                    {lines.map((line) => (
                        <li key={line.key}>
                            <span className="chart-legend-swatch" style={{ backgroundColor: line.color }} aria-hidden="true"/>
                            {withUnit(line.label, line.unit)}
                            {axisOf(line) === "right" && <span className="chart-legend-axis"> · {t("modeling.rightAxisShort")}</span>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// Widens a range to round numbers and puts the ticks on a round step, so they're readable
function niceScale(min: number, max: number): { domain: Domain; ticks: number[] } {
    const span = max - min;
    if (!(span > 0)) return { domain: [min, max], ticks: [min, max] };
    const magnitude = 10 ** Math.floor(Math.log10(span));
    const ratio = span / magnitude;
    const step = magnitude / (ratio < 2 ? 5 : ratio < 5 ? 2 : 1);
    const lo = Math.floor(min / step);
    const hi = Math.ceil(max / step);
    // Multiplying whole step counts avoids floating-point drift like 0.30000000000000004
    const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => Number(((lo + i) * step).toPrecision(12)));
    return { domain: [ticks[0], ticks[ticks.length - 1]], ticks };
}

// Short, readable tick labels for values of any size
export function formatTick(value: number): string {
    if (!Number.isFinite(value)) return String(value);
    const abs = Math.abs(value);
    if (abs !== 0 && (abs >= 1e5 || abs < 1e-3)) return value.toExponential(1);
    return String(Math.round(value * 1000) / 1000);
}
