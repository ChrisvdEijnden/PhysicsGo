import type { Calibration, MediaPoint, SavedMedia } from "../data/Projects";

// Real length per pixel of a calibration
export const unitsPerPixel = (c: Calibration) => c.length / Math.hypot(c.bx - c.ax, c.by - c.ay);

// Six significant digits: plenty for hand-plotted points, without float noise in tooltips
const tidy = (v: number) => Number(v.toPrecision(6));

// A media's points as real distances from its origin (in pixels when it has no calibration), with
// video times counted from the moment chosen as t = 0
export function realPoints(item: SavedMedia): MediaPoint[] {
    const c = item.calibration;
    const zero = item.category === "video" ? item.timeZero ?? 0 : 0;
    const time = (t: number | null) => (t === null ? null : tidy(t - zero));
    if (!c) return item.points.map((p) => ({ ...p, t: time(p.t) }));
    const k = unitsPerPixel(c);
    return item.points.map((p) => ({ t: time(p.t), x: tidy((p.x - c.originX) * k), y: tidy((p.y - c.originY) * k) }));
}
