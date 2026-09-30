import { describe, expect, test } from "vitest";
import { fitCurve, fitFormula } from "./fit";

const sample = (f: (x: number) => number, from: number, to: number, n: number) =>
    Array.from({ length: n }, (_, i) => {
        const x = from + ((to - from) * i) / (n - 1);
        return { x, y: f(x) };
    });

// A small, repeatable wobble, so fits aren't only tried on exact data
const noisy = (points: { x: number; y: number }[], size: number) =>
    points.map((p, i) => ({ x: p.x, y: p.y + size * Math.sin(i * 12.9898) }));

const values = (fit: ReturnType<typeof fitCurve>) => fit!.params.map((p) => p.value);

describe("curve fitting", () => {
    test("straight lines, through the origin or not", () => {
        const line = fitCurve("linear", sample((x) => 2.5 * x - 1, 0, 10, 20));
        expect(values(line)[0]).toBeCloseTo(2.5, 9);
        expect(values(line)[1]).toBeCloseTo(-1, 9);
        expect(line!.r2).toBeCloseTo(1, 12);
        expect(values(fitCurve("proportional", sample((x) => 3 * x, 0, 5, 6)))[0]).toBeCloseTo(3, 12);
    });

    test("parabolas, also far from x = 0 where plain normal equations lose precision", () => {
        const fit = fitCurve("quadratic", sample((t) => -4.905 * t * t + 20 * t + 3, 1000, 1004, 50));
        expect(values(fit)[0]).toBeCloseTo(-4.905, 4);
        expect(fit!.at(1002)).toBeCloseTo(-4.905 * 1002 ** 2 + 20 * 1002 + 3, 0);
        expect(fit!.r2).toBeCloseTo(1, 9);
    });

    test("exponential decay and power laws", () => {
        const decay = fitCurve("exponential", noisy(sample((t) => 5 * Math.exp(-0.7 * t), 0, 6, 40), 0.01));
        expect(values(decay)[0]).toBeCloseTo(5, 1);
        expect(values(decay)[1]).toBeCloseTo(-0.7, 2);
        const power = fitCurve("power", sample((l) => 2.006 * l ** 0.5, 0.1, 2, 30));
        expect(values(power)[1]).toBeCloseTo(0.5, 6);
        expect(power!.r2).toBeGreaterThan(0.999999);
    });

    test("a sine is found without guessing its frequency", () => {
        const points = noisy(sample((t) => 0.3 * Math.sin(2.2 * t + 0.4) + 1, 0, 12, 200), 0.005);
        const fit = fitCurve("sine", points);
        const [A, w, phi, C] = values(fit);
        expect(A).toBeCloseTo(0.3, 2);
        expect(w).toBeCloseTo(2.2, 2);
        expect(phi).toBeCloseTo(0.4, 1);
        expect(C).toBeCloseTo(1, 2);
        expect(fit!.r2).toBeGreaterThan(0.99);
    });

    test("R² says how well it fits; too few points give no fit", () => {
        const scattered = [{ x: 0, y: 1 }, { x: 1, y: -1 }, { x: 2, y: 1 }, { x: 3, y: -1 }];
        expect(fitCurve("linear", scattered)!.r2).toBeLessThan(0.3);
        expect(fitCurve("quadratic", [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }])).toBeNull();
        expect(fitCurve("linear", [{ x: 0, y: NaN }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull();
    });

    test("formulas show the fitted values", () => {
        const fit = fitCurve("linear", sample((x) => 2 * x - 0.5, 0, 4, 5));
        expect(fitFormula(fit!, "t", "v")).toBe("v = 2·t − 0.5");
        // Through the origin: no leftover 4e-15, and negative values get a real minus sign
        const origin = fitCurve("linear", sample((t) => -9.81 * t, 0, 1.43, 144));
        expect(fitFormula(origin!, "t", "v")).toBe("v = −9.81·t");
        const parabola = fitCurve("quadratic", sample((t) => 10 - 4.905 * t * t, 0, 1.4, 50));
        expect(fitFormula(parabola!, "t", "h")).toBe("h = −4.905·t² + 10");
    });
});
