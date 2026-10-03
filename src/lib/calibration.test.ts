import { describe, expect, it } from "vitest";

import { directionDegrees, realPoints } from "./calibration";
import type { Calibration, SavedMedia } from "../data/Projects";

// A photo with points at these pixel positions (y up) and this calibration
function photo(points: [number, number][], calibration: Calibration | null): SavedMedia {
    return {
        id: "m", name: "photo.jpg", mime: "image/jpeg", category: "photo", varName: "photo1", step: 1 / 30,
        points: points.map(([x, y]) => ({ t: null, x, y })), graphX: "x", graphYs: [], calibration,
    };
}

// 100 pixels are 1 m; (0, 0) is at pixel (50, 50)
const level: Calibration = { ax: 0, ay: 0, bx: 100, by: 0, length: 1, unit: "m", originX: 50, originY: 50 };

describe("realPoints", () => {
    it("measures from the origin in the calibrated unit", () => {
        expect(realPoints(photo([[150, 50], [50, 250]], level)).map(({ x, y }) => [x, y])).toEqual([[1, 0], [0, 2]]);
    });

    it("turns positions with axes that are rotated, e.g. along a slope", () => {
        // The x-axis points straight up: a point 100 px above the origin is at x = 1 m
        const up = realPoints(photo([[50, 150], [-50, 50]], { ...level, angle: 90 }));
        expect(up.map(({ x, y }) => [x, y])).toEqual([[1, 0], [0, 1]]);

        // A slope of 30°: a point 200 px up the slope is 2 m along x and 0 across it
        const along = realPoints(photo([[50 + 200 * Math.cos(Math.PI / 6), 50 + 200 * Math.sin(Math.PI / 6)]], { ...level, angle: 30 }));
        expect(along[0].x).toBeCloseTo(2, 5);
        expect(along[0].y).toBeCloseTo(0, 5);
    });

    it("keeps pixels without a calibration", () => {
        expect(realPoints(photo([[12, 34]], null))[0]).toEqual({ t: null, x: 12, y: 34 });
    });
});

describe("directionDegrees", () => {
    it("gives the direction counterclockwise from the horizontal, y up", () => {
        expect(directionDegrees(0, 0, 1, 1)).toBe(45);
        expect(directionDegrees(0, 0, -1, 0)).toBe(180);
        expect(directionDegrees(10, 10, 10, 0)).toBe(-90);
    });
});
