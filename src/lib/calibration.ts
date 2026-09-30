import type { Calibration, MediaPoint, SavedMedia } from "../data/Projects";

// Real length per pixel of a calibration
export const unitsPerPixel = (c: Calibration) => c.length / Math.hypot(c.bx - c.ax, c.by - c.ay);

// Six significant digits: plenty for hand-plotted points, without float noise in tooltips
const tidy = (v: number) => Number(v.toPrecision(6));

// A media's points as real distances from its origin, or in pixels when it has no calibration
export function realPoints(item: SavedMedia): MediaPoint[] {
    const c = item.calibration;
    if (!c) return item.points;
    const k = unitsPerPixel(c);
    return item.points.map((p) => ({ t: p.t, x: tidy((p.x - c.originX) * k), y: tidy((p.y - c.originY) * k) }));
}
