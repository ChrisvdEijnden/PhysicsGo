// A chart saved as an image for a lab report: a copy of its SVG with the styles the stylesheets give it
// written onto the elements, on a white background with the light theme's colours (also when the app
// is dark), and a legend of the Y lines above. The axis titles are part of the chart. PNG is drawn at
// twice the size.

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT = "Figtree, Arial, Helvetica, sans-serif";
// Layout and text properties copied from the page; colours are set below
const COPIED = ["font-size", "font-weight", "text-anchor", "dominant-baseline", "stroke-width", "stroke-dasharray", "opacity", "visibility", "display"];
const LIGHT = { background: "#FFFFFF", text: "#0F172A", secondary: "#475569", grid: "#E2E8F0", axis: "#64748B" };
const LEGEND_HEIGHT = 28;
const PADDING = 12;

export interface ChartLegend {
    lines: { name: string; color: string }[];
}

export interface ChartImage {
    svg: string;
    width: number;
    height: number;
}

export function chartImage(chart: SVGSVGElement, legend: ChartLegend): ChartImage {
    const box = chart.getBoundingClientRect();
    const copy = chart.cloneNode(true) as SVGSVGElement;
    const from = [chart, ...chart.querySelectorAll("*")];
    const to = [copy, ...copy.querySelectorAll("*")];
    from.forEach((element, i) => {
        const computed = getComputedStyle(element);
        const style = COPIED.map((p) => `${p}:${computed.getPropertyValue(p)}`).join(";");
        to[i].setAttribute("style", `${style};font-family:${FONT}`);
    });
    // Theme colours from the stylesheets, replaced by the light theme's
    const recolor = (selector: string, property: "fill" | "stroke", color: string) =>
        copy.querySelectorAll(selector).forEach((el) => el.setAttribute("style", `${el.getAttribute("style")};${property}:${color}`));
    recolor(".recharts-cartesian-grid line", "stroke", LIGHT.grid);
    recolor(".recharts-cartesian-axis-line, .recharts-cartesian-axis-tick-line", "stroke", LIGHT.axis);
    recolor(".recharts-cartesian-axis-tick-value, .recharts-cartesian-axis-tick-value tspan", "fill", LIGHT.secondary);
    recolor(".chart-axis-title, .chart-axis-title tspan", "fill", LIGHT.text);
    recolor(".recharts-dot", "stroke", LIGHT.background);
    // Hover highlights and tooltips aren't part of the chart
    copy.querySelectorAll(".recharts-tooltip-cursor, .recharts-active-dot").forEach((el) => el.remove());

    const width = Math.round(box.width) + 2 * PADDING;
    const height = Math.round(box.height) + LEGEND_HEIGHT + 2 * PADDING;
    const image = document.createElementNS(SVG_NS, "svg");
    image.setAttribute("xmlns", SVG_NS);
    image.setAttribute("width", String(width));
    image.setAttribute("height", String(height));
    image.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const add = (name: string, attributes: Record<string, string | number>, text?: string) => {
        const element = document.createElementNS(SVG_NS, name);
        for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
        if (text !== undefined) element.textContent = text;
        image.appendChild(element);
        return element;
    };
    add("rect", { width, height, fill: LIGHT.background });

    // Legend: a coloured swatch and the name of each Y line
    let left = PADDING;
    for (const line of legend.lines) {
        add("rect", { x: left, y: PADDING + 6, width: 14, height: 4, rx: 2, fill: line.color });
        const label = add("text", {
            x: left + 20, y: PADDING + 12, fill: LIGHT.text, "font-size": 13, "font-family": FONT, "dominant-baseline": "middle",
        }, line.name);
        left += 20 + estimateWidth(label.textContent ?? "", 13) + 16;
    }

    copy.setAttribute("x", String(PADDING));
    copy.setAttribute("y", String(PADDING + LEGEND_HEIGHT));
    copy.setAttribute("width", String(Math.round(box.width)));
    copy.setAttribute("height", String(Math.round(box.height)));
    // Tick labels at the very edge (the last X value) may reach into the padding
    copy.setAttribute("overflow", "visible");
    image.appendChild(copy);

    return { svg: new XMLSerializer().serializeToString(image), width, height };
}

// Roughly how wide a text is, for spacing the legend (the exact font isn't known outside the app)
function estimateWidth(text: string, size: number) {
    return text.length * size * 0.6;
}

export async function chartPng({ svg, width, height }: ChartImage, scale = 2): Promise<Blob> {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = width * scale;
        canvas.height = height * scale;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("canvas unavailable");
        context.scale(scale, scale);
        context.drawImage(image, 0, 0, width, height);
        return await new Promise((resolve, reject) =>
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png failed"))), "image/png"));
    } finally {
        URL.revokeObjectURL(url);
    }
}
