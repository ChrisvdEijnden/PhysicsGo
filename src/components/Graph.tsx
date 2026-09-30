import { useMemo } from "react";

import LineChart, { formatTick } from "./lineChart.tsx";
import type { ChartLine, ChartMarkers, ChartPoint, ChartRow } from "./lineChart.tsx";
import type { YLine } from "../data/Projects.tsx";
import { column } from "../lib/samples";
import type { SampleTable } from "../lib/samples";
import { useTranslation } from "../lib/useTranslations";

// Line colours, readable on light and dark backgrounds
const LINE_COLORS = ["#0D9488", "#6366F1", "#E11D48", "#D97706", "#0284C7", "#65A30D"];
export const lineColor = (index: number) => LINE_COLORS[index % LINE_COLORS.length];

// A new line takes the first colour no other line on the graph uses
function freeColor(ys: YLine[]) {
    const used = new Set(ys.map((y) => y.color % LINE_COLORS.length));
    for (let i = 0; i < LINE_COLORS.length; i++) if (!used.has(i)) return i;
    return ys.length;
}

// Plotting every sample of a long run would make the chart slow; this many is plenty
const MAX_ROWS = 2000;

const finite = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v : undefined);

/**
 * A chart with one X variable and a line per Y variable, plus the controls to choose them.
 * `samples` holds every variable's value per sample (a step of a run, or a plotted point).
 */
export default function Graph({
    samples,
    variables,
    x,
    ys,
    onChange,
    markersFor,
    runPrompt,
}: {
    samples: SampleTable | null;
    variables: string[];
    x: string;
    ys: YLine[];
    onChange: (x: string, ys: YLine[]) => void;
    // Measured points to draw as dots with the line of Y variable `y`, if any
    markersFor?: (x: string, y: string) => ChartPoint[];
    // Shown when both axes are chosen but there's nothing to plot yet
    runPrompt: string;
}) {
    const { t } = useTranslation();

    const lines = useMemo(
        (): ChartLine[] => ys.map((y, i) => ({ key: `s${i}`, label: y.name, color: lineColor(y.color) })),
        [ys]
    );

    const rows = useMemo((): ChartRow[] => {
        if (!samples || !x || ys.length === 0) return [];
        const xs = column(samples, x);
        if (!xs) return [];
        const yColumns = ys.map((y) => column(samples, y.name));
        const stride = Math.ceil(samples.length / MAX_ROWS);
        const result: ChartRow[] = [];
        for (let i = 0; i < samples.length; i += stride) {
            const xValue = finite(xs[i]);
            if (xValue === undefined) continue;
            const row: ChartRow = { x: xValue };
            yColumns.forEach((values, j) => { row[`s${j}`] = finite(values?.[i]); });
            result.push(row);
        }
        return result;
    }, [samples, x, ys]);

    const markers = useMemo((): ChartMarkers[] => {
        if (!markersFor || !x) return [];
        return lines
            .map((line) => ({ key: line.key, label: line.label, color: line.color, points: markersFor(x, line.label) }))
            .filter((m) => m.points.length > 0);
    }, [markersFor, x, lines]);

    // Domain and range of everything drawn, for the footer
    const bounds = useMemo(() => {
        const xs: number[] = [];
        const values: number[] = [];
        for (const row of rows) {
            for (const line of lines) {
                const v = row[line.key];
                if (v !== undefined) {
                    xs.push(row.x);
                    values.push(v);
                }
            }
        }
        for (const m of markers) {
            for (const p of m.points) {
                xs.push(p.x);
                values.push(p.y);
            }
        }
        if (xs.length === 0) return null;
        const range = (v: number[]) => `[${formatTick(Math.min(...v))}, ${formatTick(Math.max(...v))}]`;
        return { domain: range(xs), range: range(values) };
    }, [rows, lines, markers]);

    // A saved choice stays listed even if the code no longer has that variable
    const optionsWith = (value: string) => (value && !variables.includes(value) ? [...variables, value] : variables);

    return (
        <>
            <LineChart
                rows={rows}
                lines={lines}
                markers={markers}
                xLabel={x}
                emptyMessage={!x || ys.length === 0 ? t("modeling.chartPickAxes") : runPrompt}
            />
            <div className="analysis-footer chart-footer">
                <div className="chart-footer-row">
                    <label className="axis-picker axis-picker-x">
                        {t("modeling.xAxis")}
                        <select className="axis-select" value={x} onChange={(e) => onChange(e.target.value, ys)}>
                            <option value="">{t("modeling.pickVariable")}</option>
                            {optionsWith(x).map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                    </label>
                </div>
                <div className="chart-footer-row y-lines">
                    <span>{t("modeling.yAxis")}</span>
                    {ys.map((y, i) => (
                        <span key={i} className="y-line" style={{ borderColor: lineColor(y.color) }}>
                            <span className="y-line-swatch" style={{ backgroundColor: lineColor(y.color) }} aria-hidden="true"/>
                            <select
                                className="y-line-select"
                                aria-label={t("modeling.yLine", { n: i + 1 })}
                                value={y.name}
                                onChange={(e) => onChange(x, ys.map((old, j) => (j === i ? { ...old, name: e.target.value } : old)))}
                            >
                                {optionsWith(y.name).map((name) => <option key={name} value={name}>{name}</option>)}
                            </select>
                            <button
                                type="button"
                                className="y-line-remove"
                                aria-label={t("modeling.removeLine", { name: y.name })}
                                onClick={() => onChange(x, ys.filter((_, j) => j !== i))}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                    {/* Choosing a variable here adds it as a new line; the picker then resets */}
                    <select
                        className="axis-select y-line-add"
                        aria-label={t("modeling.addLine")}
                        value=""
                        onChange={(e) => e.target.value && onChange(x, [...ys, { name: e.target.value, color: freeColor(ys) }])}
                    >
                        <option value="">{ys.length === 0 ? t("modeling.pickVariable") : t("modeling.addLine")}</option>
                        {variables.filter((name) => !ys.some((y) => y.name === name)).map((name) => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                </div>
                {bounds && (
                    <div className="chart-footer-row">
                        <span>{t("modeling.domain")} <strong>{bounds.domain}</strong></span>
                        <span className="code-footer-dot">·</span>
                        <span>{t("modeling.range")} <strong>{bounds.range}</strong></span>
                    </div>
                )}
            </div>
        </>
    );
}
