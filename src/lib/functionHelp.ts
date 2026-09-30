import type { Language } from "./useLanguage";

// What each built-in function, keyword and constant does, for the help page (#/help) and the code
// editor's hover text. The names and number of values match the interpreter's own table
// (InterpreterGo/src/compile.rs); functionHelp.test.ts checks that.

type Text = Record<Language, string>;

export interface FunctionHelp {
    // English name, and the Dutch one (often the same); both work in any code
    name: string;
    nl: string;
    // How many values it takes, as the interpreter reports it: "1", "2", or "1+" for one or more
    args: string;
    // The values' names between the brackets, e.g. "y, x"
    params: Text;
    text: Text;
}

const same = (text: string): Text => ({ en: text, nl: text });

export const FUNCTION_HELP: FunctionHelp[] = [
    { name: "sin", nl: "sin", args: "1", params: same("x"), text: { en: "Sine of the angle x, in radians.", nl: "Sinus van de hoek x, in radialen." } },
    { name: "cos", nl: "cos", args: "1", params: same("x"), text: { en: "Cosine of the angle x, in radians.", nl: "Cosinus van de hoek x, in radialen." } },
    { name: "tan", nl: "tan", args: "1", params: same("x"), text: { en: "Tangent of the angle x, in radians.", nl: "Tangens van de hoek x, in radialen." } },
    {
        name: "asin", nl: "arcsin", args: "1", params: same("x"),
        text: { en: "The angle whose sine is x, in radians (−π/2 to π/2).", nl: "De hoek waarvan de sinus x is, in radialen (−π/2 tot π/2)." },
    },
    {
        name: "acos", nl: "arccos", args: "1", params: same("x"),
        text: { en: "The angle whose cosine is x, in radians (0 to π).", nl: "De hoek waarvan de cosinus x is, in radialen (0 tot π)." },
    },
    {
        name: "atan", nl: "arctan", args: "1", params: same("x"),
        text: { en: "The angle whose tangent is x, in radians (−π/2 to π/2).", nl: "De hoek waarvan de tangens x is, in radialen (−π/2 tot π/2)." },
    },
    {
        name: "atan2", nl: "arctan2", args: "2", params: same("y, x"),
        text: {
            en: "The direction of the point (x, y), in radians (−π to π): like atan(y / x), but in the right quadrant. Note that y comes first.",
            nl: "De richting van het punt (x, y), in radialen (−π tot π): zoals arctan(y / x), maar in het goede kwadrant. Let op: y staat voorop.",
        },
    },
    { name: "sqrt", nl: "wortel", args: "1", params: same("x"), text: { en: "Square root of x.", nl: "Wortel van x." } },
    { name: "abs", nl: "abs", args: "1", params: same("x"), text: { en: "Absolute value: x without its minus sign.", nl: "Absolute waarde: x zonder minteken." } },
    { name: "exp", nl: "exp", args: "1", params: same("x"), text: { en: "e to the power x.", nl: "e tot de macht x." } },
    { name: "ln", nl: "ln", args: "1", params: same("x"), text: { en: "Natural logarithm of x (base e).", nl: "Natuurlijke logaritme van x (grondtal e)." } },
    { name: "log", nl: "log", args: "1", params: same("x"), text: { en: "Logarithm of x with base 10.", nl: "Logaritme van x met grondtal 10." } },
    { name: "min", nl: "min", args: "1+", params: same("a, b, …"), text: { en: "The smallest of the values.", nl: "De kleinste van de waarden." } },
    { name: "max", nl: "max", args: "1+", params: same("a, b, …"), text: { en: "The largest of the values.", nl: "De grootste van de waarden." } },
    {
        name: "round", nl: "afronden", args: "1", params: same("x"),
        text: { en: "x rounded to a whole number: 2.5 becomes 3, −2.5 becomes −3.", nl: "x afgerond op een heel getal: 2,5 wordt 3, −2,5 wordt −3." },
    },
    { name: "floor", nl: "entier", args: "1", params: same("x"), text: { en: "x rounded down to a whole number.", nl: "x naar beneden afgerond op een heel getal." } },
    { name: "ceil", nl: "plafond", args: "1", params: same("x"), text: { en: "x rounded up to a whole number.", nl: "x naar boven afgerond op een heel getal." } },
    {
        name: "sign", nl: "teken", args: "1", params: same("x"),
        text: { en: "1 when x is positive, −1 when it's negative, 0 when it's 0.", nl: "1 als x positief is, −1 als x negatief is, 0 als x 0 is." },
    },
    {
        name: "hypot", nl: "hypot", args: "2", params: same("x, y"),
        text: { en: "Length of the vector (x, y): the square root of x² + y².", nl: "Lengte van de vector (x, y): de wortel van x² + y²." },
    },
];

// Keywords by their English word; the texts use the words of their own language
export const KEYWORD_HELP: Record<string, Text> = {
    if: {
        en: "if condition: runs the indented lines below it only when the condition holds.",
        nl: "als voorwaarde: voert de ingesprongen regels eronder alleen uit als de voorwaarde klopt.",
    },
    else: {
        en: "After an if block: else if condition: and else: run when none of the conditions before them held.",
        nl: "Na een als-blok: anders als voorwaarde: en anders: worden uitgevoerd als geen van de voorwaarden ervoor klopte.",
    },
    stop: {
        en: "stop if condition ends the model after this step.",
        nl: "stop als voorwaarde beëindigt het model na deze stap.",
    },
    and: { en: "Both conditions must hold: h > 0 and v < 0.", nl: "Beide voorwaarden moeten kloppen: h > 0 en v < 0." },
    or: { en: "At least one of the conditions must hold: h <= 0 or t > 10.", nl: "Minstens één van de voorwaarden moet kloppen: h <= 0 of t > 10." },
    not: { en: "The condition must not hold: not (h > 0).", nl: "De voorwaarde moet niet kloppen: niet (h > 0)." },
};

export const CONSTANT_HELP: Record<string, Text> = {
    pi: { en: "π = 3.14159…", nl: "π = 3,14159…" },
    e: {
        en: "e = 2.71828…, the base of the natural logarithm. A model that gives e a value itself (e.g. e = 1.6e-19) uses its own.",
        nl: "e = 2,71828…, het grondtal van de natuurlijke logaritme. Een model dat e zelf een waarde geeft (bv. e = 1.6e-19) gebruikt die.",
    },
};

// Points plotted in a video or photo, e.g. x_video1 or y_photo2_px
export function measuredHelp(name: string, language: Language): string | null {
    const match = /^([xy])_((?:video|photo)\d+)(_px)?$/.exec(name);
    if (!match) return null;
    const [, axis, media, pixels] = match;
    return language === "nl"
        ? `Gemeten ${axis}-positie van de punten in ${media}${pixels ? ", in pixels" : ""}, op de huidige t.`
        : `Measured ${axis} position of the points in ${media}${pixels ? ", in pixels" : ""}, at the current t.`;
}

// A function's name in a language, and how it's called, e.g. "arctan2(y, x)"
export const functionLabel = (f: FunctionHelp, language: Language) => `${language === "nl" ? f.nl : f.name}(${f.params[language]})`;
