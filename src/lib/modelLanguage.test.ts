/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { FUNCTION_NAMES, KEYWORDS, translateCode } from "./modelLanguage";

describe("showing code in Dutch or English", () => {
    const dutch = [
        "// valt tot de grond",
        "a = -g",
        "als h > 0 en niet (v > 0):",
        "    v = v + a * dt",
        "anders als h > 10 of klaar == 1:",
        "    v = wortel(2 * g * h)",
        "anders:",
        "    x = afronden(x) + entier (y)",
        "stop als h <= 0",
    ].join("\n");
    const english = [
        "// valt tot de grond",
        "a = -g",
        "if h > 0 and not (v > 0):",
        "    v = v + a * dt",
        "else if h > 10 or klaar == 1:",
        "    v = sqrt(2 * g * h)",
        "else:",
        "    x = round(x) + floor (y)",
        "stop if h <= 0",
    ].join("\n");

    test("keywords and function names change; names, numbers and comments don't", () => {
        expect(translateCode(dutch, "en")).toBe(english);
        expect(translateCode(english, "nl")).toBe(dutch);
        expect(translateCode(dutch, "nl")).toBe(dutch);
    });

    test("words inside comments, longer names and numbers stay", () => {
        expect(translateCode("// als het regent of niet\nx = 6.674e-11 // en verder", "en"))
            .toBe("// als het regent of niet\nx = 6.674e-11 // en verder");
        expect(translateCode("als_x = 1\nifx = alsof + 2", "en")).toBe("als_x = 1\nifx = alsof + 2");
    });

    test("a variable with a function's name stays a variable", () => {
        expect(translateCode("teken = 1\ny = teken + teken(x)", "en")).toBe("teken = 1\ny = teken + sign(x)");
    });

    test("mixed code comes out in one language", () => {
        expect(translateCode("if x > 0 en y > 0:\n    z = sqrt(x)", "nl")).toBe("als x > 0 en y > 0:\n    z = wortel(x)");
    });
});

// The interpreter has the same words; checked when it has been built (src/wasm, made by pnpm build)
const wasmFile = path.join(import.meta.dirname, "../wasm/interpreterGo_bg.wasm");
describe.skipIf(!fs.existsSync(wasmFile))("the interpreter knows the same words", () => {
    test("keywords and function names match", async () => {
        const wasm = await import("../wasm/interpreterGo.js");
        await wasm.default({ module_or_path: fs.readFileSync(wasmFile) });
        const info = wasm.language() as { keywords: { nl: string; en: string }[]; functions: { name: string; nl: string }[] };
        expect(info.keywords).toEqual(KEYWORDS);
        expect(info.functions.filter((f) => f.nl !== f.name).map((f) => ({ nl: f.nl, en: f.name }))).toEqual(FUNCTION_NAMES);
    });
});
