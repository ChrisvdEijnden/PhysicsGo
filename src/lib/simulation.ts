import { useCallback, useEffect, useRef, useState } from "react";

// Running models in a Web Worker (see simulation.worker.ts)

export interface InterpreterMessage {
    line: number;
    column: number;
    block: "start" | "model";
    code: string;
    params: Record<string, string>;
    message: string;
}

export interface RunResult {
    names: string[];
    columns: Float64Array[];
    steps: number;
    stopReason: "condition" | "limit" | "error";
    error: InterpreterMessage | null;
    // The first variable that became NaN or infinite
    warning: InterpreterMessage | null;
}

export interface Builtins {
    functions: { name: string; minArgs: number; maxArgs: number | null }[];
    keywords: string[];
    constants: string[];
}

export interface MeasuredSeries {
    name: string;
    t: number[];
    values: number[];
}

type Status = "loading" | "ready" | "running" | "failed";

// A worker that runs one model at a time; stopping a run replaces it with a fresh worker
export function useSimulation() {
    const worker = useRef<Worker | null>(null);
    const [status, setStatus] = useState<Status>("loading");
    const [builtins, setBuiltins] = useState<Builtins | null>(null);
    const [progress, setProgress] = useState(0);
    const pending = useRef<((r: RunResult | null) => void) | null>(null);

    const start = useCallback(() => {
        worker.current?.terminate();
        const w = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
        w.onmessage = (e: MessageEvent) => {
            const msg = e.data;
            if (msg.type === "ready") {
                setBuiltins(msg.builtins);
                setStatus("ready");
            } else if (msg.type === "failed") {
                setStatus("failed");
            } else if (msg.type === "progress") {
                setProgress(msg.steps);
            } else if (msg.type === "done") {
                setStatus("ready");
                pending.current?.(msg.result);
                pending.current = null;
            }
        };
        w.onerror = () => setStatus("failed");
        worker.current = w;
    }, []);

    useEffect(() => {
        start();
        return () => worker.current?.terminate();
    }, [start]);

    const run = useCallback((code: { start: string; model: string }, maxSteps: number, data: MeasuredSeries[]) =>
        new Promise<RunResult | null>((resolve) => {
            if (!worker.current || status === "failed") return resolve(null);
            pending.current?.(null);
            pending.current = resolve;
            setProgress(0);
            setStatus("running");
            worker.current.postMessage({ start: code.start, model: code.model, maxSteps, data });
        }), [status]);

    // Stops the running model; its promise resolves with null
    const stop = useCallback(() => {
        pending.current?.(null);
        pending.current = null;
        setStatus("loading");
        start();
    }, [start]);

    return { status, builtins, progress, run, stop };
}
