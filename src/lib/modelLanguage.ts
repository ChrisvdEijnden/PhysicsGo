import type { Language } from "./useLanguage";

// The modeling language in Dutch and English. The interpreter runs both in any code (its grammar and
// function table, InterpreterGo/src); the app shows and suggests the words of the chosen language.
// These tables are the same as the interpreter's (modelLanguage.test.ts checks that).

export const KEYWORDS: { nl: string; en: string }[] = [
    { nl: "als", en: "if" },
    { nl: "anders", en: "else" },
    { nl: "stop", en: "stop" },
    { nl: "en", en: "and" },
    { nl: "of", en: "or" },
    { nl: "niet", en: "not" },
];

// Built-in functions whose Dutch name differs (the others are the same in both)
export const FUNCTION_NAMES: { nl: string; en: string }[] = [
    { nl: "arcsin", en: "asin" },
    { nl: "arccos", en: "acos" },
    { nl: "arctan", en: "atan" },
    { nl: "arctan2", en: "atan2" },
    { nl: "wortel", en: "sqrt" },
    { nl: "afronden", en: "round" },
    { nl: "entier", en: "floor" },
    { nl: "plafond", en: "ceil" },
    { nl: "teken", en: "sign" },
];

const keywordIn = new Map<string, { nl: string; en: string }>();
for (const k of KEYWORDS) keywordIn.set(k.nl, k).set(k.en, k);
const functionIn = new Map<string, { nl: string; en: string }>();
for (const f of FUNCTION_NAMES) functionIn.set(f.nl, f).set(f.en, f);

// A comment, a number (so the e of 6.674e-11 isn't read as a name), a name, or any other character
const TOKEN = /\/\/[^\n]*|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[\s\S]/g;

/**
 * The same code with its keywords, and the names of functions it calls, in `language`:
 * "stop als t >= 10" ↔ "stop if t >= 10", "wortel(x)" ↔ "sqrt(x)". Variable names, numbers and
 * comments stay as they are. Code that mixes both languages comes out in one.
 */
export function translateCode(code: string, language: Language): string {
    let out = "";
    for (const match of code.matchAll(TOKEN)) {
        const token = match[0];
        const keyword = keywordIn.get(token);
        if (keyword) {
            out += keyword[language];
            continue;
        }
        const fn = functionIn.get(token);
        // Only a call is a function: a variable may have the same name
        if (fn && /^[ \t]*\(/.test(code.slice(match.index + token.length))) {
            out += fn[language];
            continue;
        }
        out += token;
    }
    return out;
}

// The name of a built-in function in `language`
export function functionName(name: string, language: Language): string {
    return functionIn.get(name)?.[language] ?? name;
}
