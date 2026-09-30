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
    it("name what was expected in the interface's language", () => {
        expect(describeError(error("expected", { expected: "value" }), translator("nl"))).toBe("Hier werd een waarde of berekening verwacht.");
        expect(describeError(error("expected", { expected: "comparison,logic,end" }), translator("en")))
            .toBe("Expected a comparison (<, >, <=, >=, ==, !=), 'en', 'of' or 'niet' or the end of the line here.");
    });

    it("fill in names and counts", () => {
        expect(describeError(error("no_value", { name: "G" }), translator("nl"))).toBe("'G' heeft nog geen waarde; geef hem eerst een waarde.");
        expect(describeError(error("wrong_arguments", { name: "atan2", expected: "2", given: "1" }), translator("en")))
            .toBe("'atan2' takes 2 value(s), not 1.");
    });

    it("fall back to the interpreter's English for codes this version doesn't know", () => {
        expect(describeError(error("something_new"), translator("nl"))).toBe("English fallback");
    });
});
