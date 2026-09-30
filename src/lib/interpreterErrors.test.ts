import { describe, expect, it } from "vitest";

import { describeError } from "./interpreterErrors";
import type { InterpreterError } from "./simulation";
import { translations } from "./Translations";
import type { TranslationKey } from "./Translations";

// The same substitution the app's useTranslation does, for one language
const translator = (language: "nl" | "en") => (key: TranslationKey, params?: Record<string, string | number>) =>
    Object.entries(params ?? {}).reduce<string>(
        (s, [name, value]) => s.split(`{{${name}}}`).join(String(value)),
        translations[language][key],
    );

const error = (code: string, params: Record<string, string> = {}): InterpreterError =>
    ({ line: 1, column: 1, block: "model", code, params, message: "English fallback" });

describe("interpreter errors", () => {
    it("name what was expected in the interface's language, with its keywords", () => {
        expect(describeError(error("expected", { expected: "value" }), translator("nl"), "nl")).toBe("Hier werd een waarde of berekening verwacht.");
        expect(describeError(error("expected", { expected: "comparison,logic,end" }), translator("en"), "en"))
            .toBe("Expected a comparison (<, >, <=, >=, ==, !=), 'and', 'or' or 'not' or the end of the line here.");
        expect(describeError(error("expected", { expected: "logic" }), translator("nl"), "nl")).toContain("'en', 'of' of 'niet'");
    });

    it("list the functions by their names in the interface's language", () => {
        const unknown = error("unknown_function", { name: "wortl", available: "sin, sqrt, round, sign" });
        expect(describeError(unknown, translator("nl"), "nl")).toBe("De functie 'wortl' bestaat niet. Beschikbaar: sin, wortel, afronden, teken.");
        expect(describeError(unknown, translator("en"), "en")).toBe("There's no function 'wortl'. Available: sin, sqrt, round, sign.");
    });

    it("fill in names and counts", () => {
        expect(describeError(error("no_value", { name: "G" }), translator("nl"), "nl")).toBe("'G' heeft nog geen waarde; geef hem eerst een waarde.");
        expect(describeError(error("wrong_arguments", { name: "atan2", expected: "2", given: "1" }), translator("en"), "en"))
            .toBe("'atan2' takes 2 value(s), not 1.");
    });

    it("fall back to the interpreter's English for codes this version doesn't know", () => {
        expect(describeError(error("something_new"), translator("nl"), "nl")).toBe("English fallback");
    });
});
