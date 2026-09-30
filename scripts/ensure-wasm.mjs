// Builds the modeling interpreter (InterpreterGo, Rust) into src/wasm when it's missing or older
// than its sources, so `dev` and `build` work on a fresh clone. The output isn't committed.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const crate = path.join(root, "InterpreterGo");
const output = path.join(root, "src", "wasm", "interpreterGo.js");

function newestSource(dir) {
    let newest = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        newest = Math.max(newest, entry.isDirectory() ? newestSource(full) : statSync(full).mtimeMs);
    }
    return newest;
}

const sourcesChanged = Math.max(newestSource(path.join(crate, "src")), statSync(path.join(crate, "Cargo.toml")).mtimeMs);
if (existsSync(output) && statSync(output).mtimeMs >= sourcesChanged) process.exit(0);

console.log("Building the interpreter (InterpreterGo → src/wasm)…");
const result = spawnSync("wasm-pack", ["build", "InterpreterGo", "--target", "web", "--out-dir", "../src/wasm"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
});
if (result.error?.code === "ENOENT") {
    console.error("\nwasm-pack isn't installed. Install Rust (https://rustup.rs), then run:\n" +
        "  rustup target add wasm32-unknown-unknown\n  cargo install wasm-pack\nSee README.md.");
    process.exit(1);
}
process.exit(result.status ?? 1);
