/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { CONSTANT_HELP, FUNCTION_HELP, KEYWORD_HELP } from "./functionHelp";
import { KEYWORDS } from "./modelLanguage";

test("every keyword has an explanation", () => {
    expect(Object.keys(KEYWORD_HELP).sort()).toEqual(KEYWORDS.map((k) => k.en).sort());
});

// The help describes the interpreter's own built-ins; checked when it has been built (src/wasm, made by pnpm build)
const wasmFile = path.join(import.meta.dirname, "../wasm/interpreterGo_bg.wasm");
describe.skipIf(!fs.existsSync(wasmFile))("the help matches the interpreter", () => {
    test("functions, their names and values, and constants", async () => {
        const wasm = await import("../wasm/interpreterGo.js");
        await wasm.default({ module_or_path: fs.readFileSync(wasmFile) });
        const info = wasm.language() as { functions: { name: string; nl: string; args: string }[]; constants: string[] };
        expect(FUNCTION_HELP.map(({ name, nl, args }) => ({ name, nl, args }))).toEqual(info.functions);
        expect(Object.keys(CONSTANT_HELP)).toEqual(info.constants);
    });
});
