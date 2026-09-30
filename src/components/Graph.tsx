import { useMemo } from "react";

import LineChart, { formatTick } from "./lineChart.tsx";
import type { ChartCurve, ChartLine, ChartMarkers, ChartPoint, ChartRow } from "./lineChart.tsx";
import type { GraphFit, YLine } from "../data/Projects.tsx";
import { FIT_KINDS, fitCurve, fitFormula } from "../lib/fit";
import type { Fit } from "../lib/fit";
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
// Points along a fitted curve
const CURVE_POINTS = 200;

const finite = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v : undefined);

// Values in the table: six significant digits, exponents for very large or small ones
function formatValue(value: number | undefined): string {
    if (value === undefined) return "";
    const abs = Math.abs(value);
    if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return value.toExponential(4);
    return String(Number(value.toPrecision(6)));
}

// What a fit can be made through: a Y line's model values, or the points measured for it
interface FitTarget {
    y: string;
    measured: boolean;
    color: string;
    points: ChartPoint[];
}

const targetKey = (t: { y: string; measured: boolean }) => `${t.measured ? "measured" : "model"}:${t.y}`;

/**
 * A chart (or a table of its values) with one X variable and a line per Y variable, the controls to
 * choose them, and optionally a curve fitted through one of them.
 * `samples` holds every variable's value per sample (a step of a run, or a plotted point).
 */
export default function Graph({
    samples,
    variables,
    x,
    ys,
    view,
    fit,
    samplesMeasured = false,
    onChange,
    onFitChange,
    markersFor,
    runPrompt,
}: {
    samples: SampleTable | null;
    variables: string[];
    x: string;
    ys: YLine[];
    view?: "table";
    fit?: GraphFit;
    // The samples are measured points (a video's or photo's), not a model's run
    samplesMeasured?: boolean;
    onChange: (x: string, ys: YLine[]) => void;
    onFitChange: (fit: GraphFit | undefined) => void;
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

    const { rows, stride } = useMemo(() => {
        if (!samples || !x || ys.length === 0) return { rows: [], stride: 1 };
        const xs = column(samples, x);
        if (!xs) return { rows: [], stride: 1 };
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
        return { rows: result, stride };
    }, [samples, x, ys]);

    const markers = useMemo((): ChartMarkers[] => {
        if (!markersFor || !x) return [];
        return lines
            .map((line) => ({ key: line.key, label: line.label, color: line.color, points: markersFor(x, line.label) }))
            .filter((m) => m.points.length > 0);
    }, [markersFor, x, lines]);

    const targets = useMemo((): FitTarget[] => {
        const list: FitTarget[] = [];
        lines.forEach((line) => {
            const measured = markers.find((m) => m.key === line.key);
            if (measured) list.push({ y: line.label, measured: true, color: line.color, points: measured.points });
            const points: ChartPoint[] = [];
            for (const row of rows) {
                const y = row[line.key];
                if (y !== undefined) points.push({ x: row.x, y });
            }
            if (points.length > 0) list.push({ y: line.label, measured: samplesMeasured, color: line.color, points });
        });
        return list;
    }, [lines, markers, rows, samplesMeasured]);

    const target = fit ? targets.find((tg) => targetKey(tg) === targetKey(fit)) : undefined;
    const fitted = useMemo((): Fit | null => (fit && target ? fitCurve(fit.kind, target.points) : null), [fit, target]);

    const curves = useMemo((): ChartCurve[] => {
        if (!fitted || !target) return [];
        const xs = target.points.map((p) => p.x);
        const [lo, hi] = [Math.min(...xs), Math.max(...xs)];
        const points: ChartPoint[] = [];
        for (let i = 0; i <= CURVE_POINTS; i++) {
            const px = lo + ((hi - lo) * i) / CURVE_POINTS;
            const py = fitted.at(px);
            if (Number.isFinite(py)) points.push({ x: px, y: py });
        }
        return [{ key: "fit", color: target.color, points }];
    }, [fitted, target]);

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

    const emptyMessage = !x || ys.length === 0 ? t("modeling.chartPickAxes") : runPrompt;

    // A newly chosen fit goes through the measured points if there are any, else the model's values
    function chooseFit(kind: string) {
        if (!kind) return onFitChange(undefined);
        const k = kind as GraphFit["kind"];
        const keep = fit && (target || targets.length === 0) ? fit : undefined;
        const first = targets.find((tg) => tg.measured) ?? targets[0];
        const on = keep ?? (first ? { y: first.y, measured: first.measured } : { y: ys[0]?.name ?? "", measured: false });
        onFitChange({ kind: k, y: on.y, measured: on.measured });
    }

    return (
        <>
            {view === "table" ? (
                <ValueTable x={x} lines={lines} rows={rows} markers={markers} stride={stride} emptyMessage={emptyMessage}/>
            ) : (
                <LineChart rows={rows} lines={lines} markers={markers} curves={curves} xLabel={x} emptyMessage={emptyMessage}/>
            )}
            <div className="analysis-footer chart-footer">
                <div className="chart-footer-row">
                    <label className="axis-picker axis-picker-x">
                        {t("modeling.xAxis")}
                        <select className="axis-select" value={x} onChange={(e) => onChange(e.target.value, ys)}>
                            <option value="">{t("modeling.pickVariable")}</option>
                            {optionsWith(x).map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                    </label>
                    <label className="axis-picker fit-picker">
                        {t("modeling.fit")}
                        <select className="axis-select" value={fit?.kind ?? ""} onChange={(e) => chooseFit(e.target.value)}>
                            <option value="">{t("modeling.fitNone")}</option>
                            {FIT_KINDS.map((kind) => <option key={kind} value={kind}>{t(`modeling.fitKind.${kind}`)}</option>)}
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
                {fit && (
                    <div className="chart-footer-row fit-result" role="status">
                        {/* Only a choice when there's more than one thing to fit through */}
                        {targets.length > 1 || (targets.length === 1 && !target) ? (
                            <select className="axis-select fit-target" aria-label={t("modeling.fitTarget")}
                                    value={target ? targetKey(target) : ""}
                                    onChange={(e) => {
                                        const next = targets.find((tg) => targetKey(tg) === e.target.value);
                                        if (next) onFitChange({ kind: fit.kind, y: next.y, measured: next.measured });
                                    }}>
                                {!target && <option value="">{fit.y}</option>}
                                {targets.map((tg) => (
                                    <option key={targetKey(tg)} value={targetKey(tg)}>
                                        {t(tg.measured ? "modeling.fitMeasured" : "modeling.fitModel", { name: tg.y })}
                                    </option>
                                ))}
                            </select>
                        ) : null}
                        {fitted && target ? (
                            <>
                                <span className="fit-swatch" style={{ borderColor: target.color }} aria-hidden="true"/>
                                <strong className="fit-formula">{fitFormula(fitted, x, target.y)}</strong>
                                <span className="code-footer-dot">·</span>
                                <span>R² = <strong>{fitted.r2.toFixed(4)}</strong></span>
                            </>
                        ) : (
                            <span>{target ? t("modeling.fitFailed") : t("modeling.fitNothing")}</span>
                        )}
                    </div>
                )}
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

// The graph's values as a table: the model's (every `stride`th step), then each set of measured points
function ValueTable({ x, lines, rows, markers, stride, emptyMessage }: {
    x: string;
    lines: ChartLine[];
    rows: ChartRow[];
    markers: ChartMarkers[];
    stride: number;
    emptyMessage: string;
}) {
    const { t } = useTranslation();
    if (rows.length === 0 && markers.length === 0) {
        return <div className="value-table-area"><p className="chart-empty">{emptyMessage}</p></div>;
    }
    const header = (names: ChartLine[] | ChartMarkers[]) => (
        <thead>
            <tr>
                <th scope="col">{x}</th>
                {names.map((line) => (
                    <th key={line.key} scope="col">
                        <span className="y-line-swatch" style={{ backgroundColor: line.color }} aria-hidden="true"/>
                        {line.label}
                    </th>
                ))}
            </tr>
        </thead>
    );
    return (
        <div className="value-table-area" tabIndex={0} aria-label={t("modeling.tableLabel", { x })}>
            {rows.length > 0 && (
                <table className="value-table">
                    {(markers.length > 0 || stride > 1) && (
                        <caption>
                            {markers.length > 0 && t("modeling.tableModel")}
                            {stride > 1 && <span className="value-table-note"> {t("modeling.tableEvery", { n: stride })}</span>}
                        </caption>
                    )}
                    {header(lines)}
                    <tbody>
                        {rows.map((row, i) => (
                            <tr key={i}>
                                <td>{formatValue(row.x)}</td>
                                {lines.map((line) => <td key={line.key}>{formatValue(row[line.key])}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {markers.map((m) => (
                <table key={m.key} className="value-table">
                    <caption>{t("modeling.tableMeasured", { name: m.label })}</caption>
                    {header([m])}
                    <tbody>
                        {m.points.map((p, i) => (
                            <tr key={i}>
                                <td>{formatValue(p.x)}</td>
                                <td>{formatValue(p.y)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ))}
        </div>
    );
}
