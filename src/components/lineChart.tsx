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
import { lineData } from "../data/chartData.tsx";

const T_MIN = lineData[0].t;
const T_MAX = lineData[lineData.length - 1].t;
const FULL_SPAN = T_MAX - T_MIN;
// Narrowest allowed zoom window, as a fraction of the full range — keeps you
// from zooming into a span with nothing visibly left to look at.
const MIN_SPAN = FULL_SPAN * 0.1;

type Domain = [number, number];

export default function LineChart() {
    const [domain, setDomain] = useState<Domain>([T_MIN, T_MAX]);
    const chartAreaRef = useRef<HTMLDivElement | null>(null);

    // Shrinks or grows the visible domain by a proportional (not rounded) step,
    // keeping the value at `pivotFraction` (0 = left edge, 1 = right edge)
    // stationary. Because the step is a plain fraction of the current span
    // rather than a rounded integer, it can never stall out the way an
    // index-based window can at small sizes.
    const applyZoom = useCallback((pivotFraction: number, zoomingIn: boolean) => {
        setDomain(([lo, hi]) => {
            const span = hi - lo;
            const step = span * 0.2;
            let newSpan = zoomingIn ? span - step : span + step;
            newSpan = Math.max(MIN_SPAN, Math.min(FULL_SPAN, newSpan));

            const pivotValue = lo + pivotFraction * span;
            let newLo = pivotValue - pivotFraction * newSpan;
            let newHi = newLo + newSpan;

            if (newLo < T_MIN) {
                newHi += T_MIN - newLo;
                newLo = T_MIN;
            }
            if (newHi > T_MAX) {
                newLo -= newHi - T_MAX;
                newHi = T_MAX;
            }
            newLo = Math.max(T_MIN, newLo);
            newHi = Math.min(T_MAX, newHi);

            return [newLo, newHi];
        });
    }, []);

    // Scroll-to-zoom, centered on the cursor. Attached as a native, non-passive
    // listener so preventDefault() reliably stops the page from scrolling too
    // (React's onWheel is passive by default and can't stop that on its own).
    // Double-click resets back to the full range, since there's no reset button.
    useEffect(() => {
        const el = chartAreaRef.current;
        if (!el) return;

        function handleWheel(e: WheelEvent) {
            e.preventDefault();
            const rect = el!.getBoundingClientRect();
            const pivotFraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            applyZoom(pivotFraction, e.deltaY < 0);
        }

        function handleDoubleClick() {
            setDomain([T_MIN, T_MAX]);
        }

        el.addEventListener("wheel", handleWheel, { passive: false });
        el.addEventListener("dblclick", handleDoubleClick);
        return () => {
            el.removeEventListener("wheel", handleWheel);
            el.removeEventListener("dblclick", handleDoubleClick);
        };
    }, [applyZoom]);

    // Y-axis stays fixed to the full dataset's range rather than refitting to
    // whatever's currently zoomed in, since the line itself always carries the
    // complete data now (only the visible x-domain changes).
    const yDomain = useMemo((): [number, number] => {
        const values = lineData.map((d) => d.omega);
        return [Math.min(...values), Math.max(...values)];
    }, []);

    return (
        <div className="chart-area" ref={chartAreaRef}>
            <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart
                    data={lineData}
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
                        dataKey="t"
                        domain={domain}
                        allowDataOverflow
                        fontSize="13"
                        fontFamily="Figtree"
                    />
                    <YAxis
                        width={40
                    }
                        tickMargin={4}
                        domain={yDomain}
                        fontSize="13"
                        fontFamily="Figtree"
                    />

                    <Tooltip
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

                    <Line
                        type="monotone"
                        dataKey="omega"
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