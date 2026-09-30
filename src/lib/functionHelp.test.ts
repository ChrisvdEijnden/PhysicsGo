/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { CONSTANT_HELP, FUNCTION_HELP, KEYWORD_HELP, measuredHelp } from "./functionHelp";
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

test("measured quantities are recognised by their name", () => {
    expect(measuredHelp("x_video1", "en")).toBe("Measured x position of the points in video1, at the current t.");
    expect(measuredHelp("y_photo2_px", "nl")).toBe("Gemeten y-positie van de punten in photo2, in pixels, op de huidige t.");
    expect(measuredHelp("x_video", "en")).toBeNull();
    expect(measuredHelp("z_video1", "en")).toBeNull();
});
