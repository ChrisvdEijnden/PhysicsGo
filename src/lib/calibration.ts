import type { Calibration, MediaPoint, SavedMedia } from "../data/Projects";

// Real length per pixel of a calibration
export const unitsPerPixel = (c: Calibration) => c.length / Math.hypot(c.bx - c.ax, c.by - c.ay);

// Six significant digits: plenty for hand-plotted points, without float noise in tooltips
const tidy = (v: number) => Number(v.toPrecision(6));

// The direction, in degrees counterclockwise from the picture's horizontal (y up), from one point to another,
// e.g. from the origin to a clicked point on the x-axis, or along the reference line
export function directionDegrees(fromX: number, fromY: number, toX: number, toY: number) {
    return tidy((Math.atan2(toY - fromY, toX - fromX) * 180) / Math.PI);
}

// A media's points as real distances from its origin along its axes (in pixels when it has no
// calibration), with video times counted from the moment chosen as t = 0, and a stroboscopic photo's
// one interval apart. Rotated axes (e.g. along a slope) turn the positions with them.
export function realPoints(item: SavedMedia): MediaPoint[] {
    const c = item.calibration;
    const zero = item.category === "video" ? item.timeZero ?? 0 : 0;
    const strobe = item.category === "photo" && item.interval ? item.interval : null;
    const time = (t: number | null, i: number) => (strobe !== null ? tidy(i * strobe) : t === null ? null : tidy(t - zero));
    if (!c) return item.points.map((p, i) => ({ ...p, t: time(p.t, i) }));
    const k = unitsPerPixel(c);
    const radians = ((c.angle ?? 0) * Math.PI) / 180;
    const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
    // Along the turned axes, still in pixels; rounded far below a pixel, so cos(90°) ≈ 6e-17 becomes 0
    const fine = (v: number) => Math.round(v * 1e6) / 1e6;
    return item.points.map((p, i) => {
        const [dx, dy] = [p.x - c.originX, p.y - c.originY];
        return { t: time(p.t, i), x: tidy(fine(dx * cos + dy * sin) * k), y: tidy(fine(dy * cos - dx * sin) * k) };
    });
}
