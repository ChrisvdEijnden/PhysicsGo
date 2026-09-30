// Runs models off the main thread, so a long run never freezes the page and can be stopped.
// Posts "ready" (with the language's built-ins) or "failed" once the interpreter has loaded.
import init, { Simulation, builtins } from "../wasm/interpreterGo";

// Steps per chunk; progress is reported between chunks
const CHUNK = 20_000;

const ready = init().then(
    () => postMessage({ type: "ready", builtins: builtins() }),
    (e) => postMessage({ type: "failed", message: String(e) }),
);

self.onmessage = async (e: MessageEvent) => {
    await ready;
    const { start, model, maxSteps, data } = e.data;
    let sim: Simulation;
    try {
        sim = new Simulation(start, model, maxSteps, data);
    } catch (error) {
        postMessage({ type: "done", result: { names: [], columns: [], steps: 0, stopReason: "error", error, warning: null } });
        return;
    }
    while (!sim.run(CHUNK)) postMessage({ type: "progress", steps: sim.steps() });
    const result = sim.result();
    sim.free();
    postMessage({ type: "done", result }, { transfer: result.columns.map((c: Float64Array) => c.buffer) });
};
