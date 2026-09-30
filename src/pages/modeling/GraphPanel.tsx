import { useRef } from "react";
import type { CSSProperties } from "react";

import CloseIcon20px from "../../assets/icons/close-20px.svg";
import TableIcon18px from "../../assets/icons/table-18px.svg";
import ChartIcon18px from "../../assets/icons/chart-18px.svg";
import ErrorBoundary from "../../components/ErrorBoundary";
import ExportMenu from "../../components/ExportMenu";
import Graph, { lineColor } from "../../components/Graph.tsx";
import type { ChartPoint } from "../../components/lineChart.tsx";
import type { GraphConfig } from "../../data/Projects.tsx";
import { chartImage, chartPng } from "../../lib/chartImage";
import { downloadFile, fileNameFor } from "../../lib/download";
import type { SampleTable } from "../../lib/samples";
import { useTranslation } from "../../lib/useTranslations";

// One graph in the right-hand column: the chart (or its table), with export, table/chart and close
export default function GraphPanel({ graph, index, style, history, variables, markersFor, fileBase, onChange, onRemove, onExportRun }: {
    graph: GraphConfig;
    index: number;
    style: CSSProperties;
    history: SampleTable | null;
    variables: string[];
    markersFor: (x: string, y: string) => ChartPoint[];
    // Start of exported files' names, e.g. the assignment's title
    fileBase: string;
    onChange: (changes: Partial<GraphConfig>) => void;
    onRemove: () => void;
    onExportRun: () => void;
}) {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement | null>(null);
    const table = graph.view === "table";
    const noImage = !graph.x || graph.ys.length === 0 || table;

    // The graph as it's shown now, as a PNG or SVG image with a legend (always in light colours)
    async function exportImage(format: "png" | "svg") {
        const chart = ref.current?.querySelector("svg.recharts-surface");
        if (!(chart instanceof SVGSVGElement)) return;
        const image = chartImage(chart, { lines: graph.ys.map((y) => ({ name: y.name, color: lineColor(y.color) })), x: graph.x });
        const name = fileNameFor(`${fileBase} graph ${index + 1}`, format);
        if (format === "svg") downloadFile(name, new Blob([image.svg], { type: "image/svg+xml" }));
        else downloadFile(name, await chartPng(image));
    }

    return (
        <div className="analysis" style={style} data-graph-id={graph.id} ref={ref}>
            <div className="analysis-panel-actions">
                <ExportMenu label={t("modeling.export")} items={[
                    { label: t("modeling.exportRunCsv"), disabled: !history, onSelect: onExportRun },
                    { label: t("modeling.exportPng"), disabled: noImage, onSelect: () => exportImage("png") },
                    { label: t("modeling.exportSvg"), disabled: noImage, onSelect: () => exportImage("svg") },
                ]}/>
                <button
                    type="button"
                    className="analysis-view-toggle"
                    aria-label={table ? t("modeling.showChart") : t("modeling.showTable")}
                    title={table ? t("modeling.showChart") : t("modeling.showTable")}
                    onClick={() => onChange({ view: table ? undefined : "table" })}
                >
                    <img src={table ? ChartIcon18px : TableIcon18px} alt=""/>
                </button>
                <button type="button" className="analysis-media-remove" onClick={onRemove} aria-label={t("modeling.closeGraph")}>
                    <img src={CloseIcon20px} alt=""/>
                </button>
            </div>
            {/* A new run gets a fresh chance to render */}
            <ErrorBoundary compact resetKey={history}>
                <Graph
                    samples={history}
                    variables={variables}
                    x={graph.x}
                    ys={graph.ys}
                    view={graph.view}
                    fit={graph.fit}
                    onChange={(x, ys) => onChange({ x, ys })}
                    onFitChange={(fit) => onChange({ fit })}
                    markersFor={markersFor}
                    runPrompt={t("modeling.chartRunPrompt")}
                />
            </ErrorBoundary>
        </div>
    );
}
