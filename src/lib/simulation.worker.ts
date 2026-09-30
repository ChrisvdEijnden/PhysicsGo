// Runs models away from the page, so a long run doesn't freeze it and can be stopped (by ending
// this worker). In: { id, start, model, steps, data }. Out: "ready", "progress" during a run,
// "result", or "failed" when the interpreter can't load.
import init, { simulate } from "../wasm/interpreterGo";

const ready = init().then(
    () => postMessage({ type: "ready" }),
    (error) => {
        postMessage({ type: "failed", error: String(error) });
        throw error;
    },
);

onmessage = async (e: MessageEvent) => {
    await ready;
    const { id, start, model, steps, data } = e.data;
    const result = simulate(start, model, steps, data, (done: number) => postMessage({ type: "progress", id, steps: done }));
    // The columns are handed over rather than copied
    postMessage({ type: "result", id, result }, result.columns.map((c: Float64Array) => c.buffer));
};
