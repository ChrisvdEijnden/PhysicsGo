import { useRef, useState } from "react";

import type { CodeEditorHandle, InterpreterError } from "../../components/codeEditor.tsx";
import { formatTick } from "../../components/lineChart.tsx";
import { describeError } from "../../lib/interpreterErrors";
import { column, valueAt } from "../../lib/samples";
import type { SampleTable } from "../../lib/samples";
import { useSimulation } from "../../lib/simulation";
import type { MeasuredSeries } from "../../lib/simulation";
import { useTranslation } from "../../lib/useTranslations";

export const DEFAULT_STEPS = 100_000;
export const MAX_STEPS = 1_000_000;

// How the last run ended, for the line under the code
type RunStatus = { kind: "stopped" | "limit" | "error"; steps: number; t: number | undefined };

// An empty steps field runs the placeholder's number of steps
function stepCount(steps: string) {
    const n = Math.floor(Number(steps));
    if (!steps.trim() || !Number.isFinite(n)) return DEFAULT_STEPS;
    return Math.min(MAX_STEPS, Math.max(1, n));
}

/**
 * Running the model in a worker (a long run can be stopped and doesn't freeze the page): the
 * results of the last run (the state after the start values, then after every step), how it ended,
 * and errors shown in the two editors, which each count their own lines.
 */
export function useModelRun() {
    const { t, language } = useTranslation();
    const simulation = useSimulation();
    // The chart stays empty until the model has run
    const [history, setHistory] = useState<SampleTable | null>(null);
    const [status, setStatus] = useState<RunStatus | null>(null);
    const [nonFinite, setNonFinite] = useState<{ name: string; step: number; t: number | undefined } | null>(null);
    const startEditorRef = useRef<CodeEditorHandle>(null);
    const modelEditorRef = useRef<CodeEditorHandle>(null);
    const wasmReady = simulation.state === "ready";

    async function run(start: string, model: string, steps: string, measuredData: MeasuredSeries[]) {
        if (!wasmReady || simulation.running) return;
        startEditorRef.current?.clearErrors();
        modelEditorRef.current?.clearErrors();
        setStatus(null);
        setNonFinite(null);

        const result = await simulation.run(start, model, stepCount(steps), measuredData);
        if (!result) return; // stopped
        const samples = result.samples;
        // A model that steps through something other than time (say, a position) leaves t where it is
        const tEnd = valueAt(samples, "t", samples.length - 1);
        const tStart = valueAt(samples, "t", 0);
        const moved = tEnd !== undefined && tEnd !== (tStart !== undefined && Number.isFinite(tStart) ? tStart : 0);
        const ended = { steps: Math.max(0, samples.length - 1), t: moved ? tEnd : undefined };

        if (!result.ok) {
            setStatus({ kind: "error", ...ended });
            const inBlock = (block: string): InterpreterError[] => result.errors
                .filter((e) => e.block === block)
                .map((e) => ({ line: e.line, column: e.column, message: describeError(e, t, language) }));
            startEditorRef.current?.setErrors(inBlock("start"));
            modelEditorRef.current?.setErrors(inBlock("model"));
            return;
        }

        setHistory(samples);
        setStatus({ kind: result.stopped ? "stopped" : "limit", ...ended });
        const found = result.firstNonFinite;
        setNonFinite(found && { name: found.name, step: found.step, t: column(samples, "t")?.[found.step] });
    }

    // How the last run ended, so "nothing happened" always has an explanation
    let statusText: string | null = null;
    if (status) {
        const steps = status.steps.toLocaleString(language);
        statusText = status.kind === "error" ? t("modeling.runError")
            : status.t === undefined ? t(status.kind === "stopped" ? "modeling.runStoppedNoT" : "modeling.runLimitNoT", { steps })
                : t(status.kind === "stopped" ? "modeling.runStopped" : "modeling.runLimit", { steps, t: formatTick(status.t) });
    }
    let nonFiniteText: string | null = null;
    if (nonFinite) {
        const step = nonFinite.step.toLocaleString(language);
        nonFiniteText = nonFinite.t === undefined || !Number.isFinite(nonFinite.t)
            ? t("modeling.nonFiniteNoT", { name: nonFinite.name, step })
            : t("modeling.nonFinite", { name: nonFinite.name, step, t: formatTick(nonFinite.t) });
    }

    return {
        simulation,
        wasm: simulation.state,
        wasmReady,
        history,
        // Whether the run ended normally (at its stop condition) or needs attention
        statusWarning: status !== null && status.kind !== "stopped",
        statusText,
        nonFiniteText,
        run,
        startEditorRef,
        modelEditorRef,
    };
}
