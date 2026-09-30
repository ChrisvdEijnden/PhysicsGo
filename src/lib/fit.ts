// Fitting a curve through measured or modelled points (least squares), with R² to say how well it
// fits. Linear, proportional and quadratic fits are solved exactly; the others start from a
// linearised or scanned estimate and are refined with Levenberg–Marquardt.
import type { ChartPoint } from "../components/lineChart";

export const FIT_KINDS = ["proportional", "linear", "quadratic", "exponential", "power", "sine"] as const;
export type FitKind = (typeof FIT_KINDS)[number];

export interface Fit {
    kind: FitKind;
    // The parameters by name, in the order they appear in the formula
    params: { name: string; value: number }[];
    r2: number;
    at: (x: number) => number;
}

// How many parameters each kind has: a fit needs more points than that
const PARAM_COUNT: Record<FitKind, number> = { proportional: 1, linear: 2, quadratic: 3, exponential: 2, power: 2, sine: 4 };

type Model = (p: number[], x: number) => number;

const MODELS: Record<FitKind, { names: string[]; f: Model }> = {
    proportional: { names: ["a"], f: ([a], x) => a * x },
    linear: { names: ["a", "b"], f: ([a, b], x) => a * x + b },
    quadratic: { names: ["a", "b", "c"], f: ([a, b, c], x) => a * x * x + b * x + c },
    exponential: { names: ["a", "b"], f: ([a, b], x) => a * Math.exp(b * x) },
    power: { names: ["a", "b"], f: ([a, b], x) => a * x ** b },
    sine: { names: ["A", "ω", "φ", "C"], f: ([A, w, phi, C], x) => A * Math.sin(w * x + phi) + C },
};

export function fitCurve(kind: FitKind, input: ChartPoint[]): Fit | null {
    const points = input.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (points.length <= PARAM_COUNT[kind]) return null;
    const params = estimate(kind, points);
    if (!params || !params.every(Number.isFinite)) return null;
    if (kind === "proportional" || kind === "linear" || kind === "quadratic") dropRoundingNoise(params, points);
    const { f, names } = MODELS[kind];
    const at = (x: number) => f(params, x);
    const r2 = rSquared(points, at);
    if (!Number.isFinite(r2)) return null;
    return { kind, params: names.map((name, i) => ({ name, value: params[i] })), r2, at };
}

// A polynomial term that adds next to nothing anywhere in the data (like 4e-15 for a line through the
// origin) is rounding noise: it's shown as 0. `params` runs from the highest power down to x⁰.
function dropRoundingNoise(params: number[], points: ChartPoint[]) {
    const xMax = Math.max(...points.map((p) => Math.abs(p.x)));
    const yMax = Math.max(...points.map((p) => Math.abs(p.y)));
    params.forEach((c, i) => {
        const power = params.length - 1 - i;
        if (Math.abs(c) * xMax ** power < 1e-9 * yMax) params[i] = 0;
    });
}

function estimate(kind: FitKind, points: ChartPoint[]): number[] | null {
    switch (kind) {
        case "proportional": {
            let sxy = 0;
            let sxx = 0;
            for (const { x, y } of points) {
                sxy += x * y;
                sxx += x * x;
            }
            return sxx > 0 ? [sxy / sxx] : null;
        }
        case "linear":
            return polynomial(points, 1);
        case "quadratic":
            return polynomial(points, 2);
        case "exponential": {
            // ln y = ln a + b·x for the points above zero (or below, for a negative a), then refined
            const sign = points.filter((p) => p.y < 0).length > points.length / 2 ? -1 : 1;
            const logs = points.filter((p) => sign * p.y > 0).map((p) => ({ x: p.x, y: Math.log(sign * p.y) }));
            const line = logs.length >= 2 ? polynomial(logs, 1) : null;
            if (!line) return null;
            return refine(MODELS.exponential.f, points, [sign * Math.exp(line[1]), line[0]]);
        }
        case "power": {
            // ln y = ln a + b·ln x, for x above zero
            const sign = points.filter((p) => p.y < 0).length > points.length / 2 ? -1 : 1;
            const usable = points.filter((p) => p.x > 0);
            const logs = usable.filter((p) => sign * p.y > 0).map((p) => ({ x: Math.log(p.x), y: Math.log(sign * p.y) }));
            const line = logs.length >= 2 ? polynomial(logs, 1) : null;
            if (!line || usable.length <= 2) return null;
            return refine(MODELS.power.f, usable, [sign * Math.exp(line[1]), line[0]]);
        }
        case "sine":
            return sine(points);
    }
}

// Least squares polynomial of degree `degree`: [highest power's coefficient, …, constant]
function polynomial(points: ChartPoint[], degree: number): number[] | null {
    const n = degree + 1;
    // Centring and scaling x keeps the normal equations well conditioned for large x (e.g. times)
    const { mid, scale } = normaliser(points.map((p) => p.x));
    const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const b = new Array<number>(n).fill(0);
    for (const p of points) {
        const u = (p.x - mid) / scale;
        const powers = Array.from({ length: n }, (_, i) => u ** i);
        for (let i = 0; i < n; i++) {
            b[i] += powers[i] * p.y;
            for (let j = 0; j < n; j++) A[i][j] += powers[i] * powers[j];
        }
    }
    const c = solve(A, b);
    if (!c) return null;
    // Back from u = (x − mid)/scale to x: expand Σ cᵢ·((x − mid)/scale)^i
    const coefficients = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
        for (let k = 0; k <= i; k++) {
            coefficients[k] += c[i] * binomial(i, k) * (-mid) ** (i - k) / scale ** i;
        }
    }
    return coefficients.reverse();
}

// y = A·sin(ωx + φ) + C. For each trial ω, a·sin ωx + b·cos ωx + C is linear, so scanning ω and
// keeping the best linear fit finds the frequency without a guess; that is then refined.
function sine(points: ChartPoint[]): number[] | null {
    const xs = points.map((p) => p.x);
    const span = Math.max(...xs) - Math.min(...xs);
    if (!(span > 0)) return null;
    // From half a period over the whole range up to about two points per period
    const lowest = Math.PI / span;
    const highest = (Math.PI * points.length) / span / 2;
    const STEPS = 400;
    let best: { w: number; p: number[]; sse: number } | null = null;
    for (let i = 0; i <= STEPS; i++) {
        // Spaced evenly on a log scale, so low frequencies get as many tries as high ones
        const w = lowest * (highest / lowest) ** (i / STEPS);
        const p = linearSine(points, w);
        if (!p) continue;
        const sse = sumOfSquares(points, (x) => p[0] * Math.sin(w * x) + p[1] * Math.cos(w * x) + p[2]);
        if (!best || sse < best.sse) best = { w, p, sse };
    }
    if (!best) return null;
    const [a, b, C] = best.p;
    const start = [Math.hypot(a, b), best.w, Math.atan2(b, a), C];
    const refined = refine(MODELS.sine.f, points, start);
    if (!refined) return null;
    // One way of writing it: A above zero, φ between −π and π
    let [A, , phi] = refined;
    const w = refined[1];
    if (A < 0) {
        A = -A;
        phi += Math.PI;
    }
    phi = Math.atan2(Math.sin(phi), Math.cos(phi));
    return [A, w, phi, refined[3]];
}

function linearSine(points: ChartPoint[], w: number): number[] | null {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const b = [0, 0, 0];
    for (const p of points) {
        const row = [Math.sin(w * p.x), Math.cos(w * p.x), 1];
        for (let i = 0; i < 3; i++) {
            b[i] += row[i] * p.y;
            for (let j = 0; j < 3; j++) A[i][j] += row[i] * row[j];
        }
    }
    return solve(A, b);
}

// Levenberg–Marquardt: Gauss–Newton steps, damped towards gradient descent while they don't help
function refine(f: Model, points: ChartPoint[], start: number[]): number[] | null {
    let p = start.slice();
    let sse = sumOfSquares(points, (x) => f(p, x));
    if (!Number.isFinite(sse)) return null;
    let lambda = 1e-3;
    for (let iteration = 0; iteration < 200; iteration++) {
        const n = p.length;
        const JtJ = Array.from({ length: n }, () => new Array<number>(n).fill(0));
        const Jtr = new Array<number>(n).fill(0);
        for (const point of points) {
            const r = point.y - f(p, point.x);
            // Numerical derivatives, with a step relative to each parameter's size
            const J = p.map((value, k) => {
                const h = 1e-6 * Math.max(1, Math.abs(value));
                const q = p.slice();
                q[k] += h;
                return (f(q, point.x) - f(p, point.x)) / h;
            });
            for (let i = 0; i < n; i++) {
                Jtr[i] += J[i] * r;
                for (let j = 0; j < n; j++) JtJ[i][j] += J[i] * J[j];
            }
        }
        let improved = false;
        while (lambda < 1e12) {
            const damped = JtJ.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-12 : v)));
            const step = solve(damped, Jtr);
            if (!step) break;
            const next = p.map((v, i) => v + step[i]);
            const nextSse = sumOfSquares(points, (x) => f(next, x));
            if (Number.isFinite(nextSse) && nextSse < sse) {
                const done = sse - nextSse < 1e-12 * (sse + 1e-30);
                p = next;
                sse = nextSse;
                lambda = Math.max(lambda / 10, 1e-12);
                improved = !done;
                break;
            }
            lambda *= 10;
        }
        if (!improved) break;
    }
    return p;
}

function rSquared(points: ChartPoint[], at: (x: number) => number): number {
    const mean = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    const total = points.reduce((sum, p) => sum + (p.y - mean) ** 2, 0);
    const residual = sumOfSquares(points, at);
    // All y the same: a perfect fit is 1, anything else says nothing
    if (total === 0) return residual === 0 ? 1 : 0;
    return 1 - residual / total;
}

function sumOfSquares(points: ChartPoint[], at: (x: number) => number) {
    let sum = 0;
    for (const p of points) sum += (p.y - at(p.x)) ** 2;
    return sum;
}

function normaliser(xs: number[]) {
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    const mid = (min + max) / 2;
    const scale = (max - min) / 2 || 1;
    return { mid, scale };
}

function binomial(n: number, k: number) {
    let result = 1;
    for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
    return result;
}

// Gaussian elimination with partial pivoting; null when the system has no single solution
function solve(matrix: number[][], rhs: number[]): number[] | null {
    const n = rhs.length;
    const A = matrix.map((row, i) => [...row, rhs[i]]);
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let row = col + 1; row < n; row++) if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
        if (!(Math.abs(A[pivot][col]) > 1e-300)) return null;
        [A[col], A[pivot]] = [A[pivot], A[col]];
        for (let row = col + 1; row < n; row++) {
            const factor = A[row][col] / A[col][col];
            for (let k = col; k <= n; k++) A[row][k] -= factor * A[col][k];
        }
    }
    const x = new Array<number>(n).fill(0);
    for (let row = n - 1; row >= 0; row--) {
        let sum = A[row][n];
        for (let k = row + 1; k < n; k++) sum -= A[row][k] * x[k];
        x[row] = sum / A[row][row];
    }
    return x.every(Number.isFinite) ? x : null;
}

// Readable parameter values: four significant digits, with a real minus sign
export function formatParam(value: number): string {
    if (value === 0) return "0";
    const abs = Math.abs(value);
    const text = abs >= 1e5 || abs < 1e-3 ? value.toExponential(3).replace("e+", "e") : String(Number(value.toPrecision(4)));
    return text.replace(/-/g, "−");
}

// The formula with the fitted values filled in, e.g. "y = 2.31·x + 0.12"
export function fitFormula(fit: Fit, x: string, y: string): string {
    const v = fit.params.map((p) => formatParam(p.value));
    // Added terms that came out as 0 are left out
    const plus = (value: string) => (value === "0" ? "" : value.startsWith("−") ? ` − ${value.slice(1)}` : ` + ${value}`);
    switch (fit.kind) {
        case "proportional":
            return `${y} = ${v[0]}·${x}`;
        case "linear":
            return `${y} = ${v[0]}·${x}${plus(v[1])}`;
        case "quadratic":
            return `${y} = ${v[0]}·${x}²${v[1] === "0" ? "" : `${plus(v[1])}·${x}`}${plus(v[2])}`;
        case "exponential":
            return `${y} = ${v[0]}·e^(${v[1]}·${x})`;
        case "power":
            return `${y} = ${v[0]}·${x}^${v[1]}`;
        case "sine":
            return `${y} = ${v[0]}·sin(${v[1]}·${x}${plus(v[2])})${plus(v[3])}`;
    }
}
