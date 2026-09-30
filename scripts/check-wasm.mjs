// Runs before `dev` and `build`: the modeling interpreter is Rust compiled to WebAssembly (src/wasm,
// not in git). It's built when missing or older than its source, which needs Rust and wasm-pack.
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const output = path.join(root, "src/wasm/interpreterGo.js");
const sources = [path.join(root, "InterpreterGo/Cargo.toml"), ...fs.readdirSync(path.join(root, "InterpreterGo/src"))
    .map((f) => path.join(root, "InterpreterGo/src", f))];

const built = fs.existsSync(output) ? fs.statSync(output).mtimeMs : 0;
const stale = sources.some((f) => fs.statSync(f).mtimeMs > built);
if (!stale) process.exit(0);

const hasWasmPack = spawnSync("wasm-pack", ["--version"], { stdio: "ignore" }).status === 0;
if (!hasWasmPack) {
    const message = [
        "The modeling interpreter (src/wasm) has to be built from InterpreterGo, which needs:",
        "  - Rust: https://rustup.rs",
        "  - wasm-pack: cargo install wasm-pack",
        "then run: pnpm build:wasm",
    ].join("\n");
    if (built) {
        console.warn(`Warning: src/wasm is older than InterpreterGo's source.\n${message}\n`);
        process.exit(0);
    }
    console.error(message);
    process.exit(1);
}

console.log("Building the modeling interpreter (InterpreterGo → src/wasm)…");
execSync("wasm-pack build InterpreterGo --target web --out-dir ../src/wasm", { cwd: root, stdio: "inherit" });
