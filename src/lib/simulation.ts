import { useCallback, useEffect, useRef, useState } from "react";

import type { SampleTable } from "./samples";

// A problem in the code, with its place and a code the app translates (see interpreterErrors.ts)
export interface InterpreterError {
    line: number;
    column: number;
    block: "start" | "model";
    code: string;
    params: Record<string, string>;
    message: string;
}

export interface RunOutput {
    ok: boolean;
    // A stop condition ended the run (rather than the step limit or an error)
    stopped: boolean;
    errors: InterpreterError[];
    // The state after the start values, then after every step
    samples: SampleTable;
    // The first variable that got no valid value (NaN or infinite), and at which recorded step
    firstNonFinite: { name: string; step: number } | null;
}

export interface MeasuredSeries {
    name: string;
    t: number[];
    values: number[];
}

type Pending = { id: number; resolve: (output: RunOutput | null) => void };

// Runs models in a worker. `stop` ends a run by replacing the worker; its run resolves with null.
export function useSimulation() {
    const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const worker = useRef<Worker | null>(null);
    const pending = useRef<Pending | null>(null);
    const nextId = useRef(1);

    const startWorker = useCallback(() => {
        const w = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
        w.onmessage = (e: MessageEvent) => {
            const message = e.data;
            if (message.type === "ready") {
                setState("ready");
            } else if (message.type === "failed") {
                setState("failed");
            } else if (message.type === "progress" && message.id === pending.current?.id) {
                setProgress(message.steps);
            } else if (message.type === "result" && message.id === pending.current?.id) {
                const r = message.result;
                const run = pending.current!;
                pending.current = null;
                setRunning(false);
                run.resolve({
                    ok: r.ok,
                    stopped: r.stopped,
                    errors: r.errors,
                    samples: { names: r.names, columns: r.columns, length: r.columns[0]?.length ?? 0 },
                    firstNonFinite: r.firstNonFinite,
                });
            }
        };
        w.onerror = () => setState("failed");
        worker.current = w;
    }, []);

    useEffect(() => {
        startWorker();
        return () => {
            worker.current?.terminate();
            pending.current?.resolve(null);
        };
    }, [startWorker]);

    const run = useCallback((start: string, model: string, steps: number, data: MeasuredSeries[]) => {
        return new Promise<RunOutput | null>((resolve) => {
            if (!worker.current || pending.current) return resolve(null);
            const id = nextId.current++;
            pending.current = { id, resolve };
            setRunning(true);
            setProgress(0);
            worker.current.postMessage({ id, start, model, steps, data });
        });
    }, []);

    const stop = useCallback(() => {
        if (!pending.current) return;
        worker.current?.terminate();
        pending.current.resolve(null);
        pending.current = null;
        setRunning(false);
        setState("loading");
        startWorker();
    }, [startWorker]);

    return { state, running, progress, run, stop };
}
