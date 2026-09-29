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

export interface ChartPoint {
    x: number;
    y: number;
}

type Domain = [number, number];

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

export default function LineChart({ points, xLabel, yLabel, emptyMessage }: {
    points: ChartPoint[];
    xLabel: string;
    yLabel: string;
    emptyMessage: string;
}) {
    const isEmpty = points.length === 0;
    const [xMin, xMax] = useMemo(() => extent(points.map((p) => p.x)), [points]);
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

    // Rescales to the points inside the zoomed-in x-range, with a floor on the
    // span so a very flat or very narrow window doesn't collapse the axis.
    const yScale = useMemo(() => {
        if (isEmpty) return niceScale(...EMPTY_DOMAIN);
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
    }, [domain, points, isEmpty]);

    return (
        <div className="chart-area" ref={chartAreaRef}>
            {isEmpty && <p className="chart-empty">{emptyMessage}</p>}
            <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart
                    data={points}
                    margin={{
                        top: 0,
                        right: 0,
                        bottom: 0,
                        left: 0,
                    }}
                >
                    <CartesianGrid
                        stroke="#E2E8F0"
                    />

                    <XAxis
                        type="number"
                        dataKey="x"
                        name={xLabel}
                        domain={isEmpty ? EMPTY_DOMAIN : domain}
                        allowDataOverflow
                        tickFormatter={formatTick}
                        fontSize="13"
                        fontFamily="Figtree"
                    />
                    <YAxis
                        type="number"
                        width={48}
                        tickMargin={4}
                        domain={yScale.domain}
                        ticks={yScale.ticks}
                        allowDataOverflow
                        tickFormatter={formatTick}
                        fontSize="13"
                        fontFamily="Figtree"
                    />

                    {!isEmpty && (
                        <Tooltip
                            formatter={(value) => [formatTick(Number(value)), yLabel]}
                            labelFormatter={(value) => `${xLabel} = ${formatTick(Number(value))}`}
                            contentStyle={{
                                fontSize: "13px",
                                fontFamily: "Figtree, sans-serif",
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

                    <Line
                        type="linear"
                        dataKey="y"
                        stroke="#0D9488"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                </RechartsLineChart>
            </ResponsiveContainer>
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
