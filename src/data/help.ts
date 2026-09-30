import type { Language } from "../lib/useLanguage";

// The help page (#/help): how a model works and everything that can be written in one. Text between
// `backticks` is shown as code. The functions, keywords and constants come from lib/functionHelp.ts.
// Keep it in step with the interpreter (InterpreterGo/src) and the modeling page.

export type HelpBlock =
    | { p: string }
    | { list: string[] }
    | { code: string }
    | { table: string[][]; head: string[] }
    | { builtIn: "keywords" | "functions" | "constants" };

export interface HelpSection {
    id: string;
    title: string;
    blocks: HelpBlock[];
}

export interface HelpText {
    title: string;
    intro: string;
    contents: string;
    // Column titles of the built-in tables
    columns: { word: string; otherLanguage: string; meaning: string; function: string; constant: string };
    sections: HelpSection[];
}

export const HELP: Record<Language, HelpText> = {
    en: {
        title: "Help",
        intro: "In PhysicsGo you describe how something changes in small steps of time, and the computer works out what happens step by step. This page explains how a model works and everything you can write in one.",
        contents: "Contents",
        columns: { word: "Word", otherLanguage: "In Dutch", meaning: "What it does", function: "Function", constant: "Constant" },
        sections: [
            {
                id: "model",
                title: "How a model works",
                blocks: [
                    { p: "A model has two parts, each in its own editor:" },
                    {
                        list: [
                            "Start values run once, before the first step. Give every quantity its value at the start, and the time step `dt`.",
                            "Model rules run every step, from top to bottom. After each step the time `t` goes up by `dt`, unless the rules change `t` themselves (with `t = t + dt`).",
                        ],
                    },
                    { p: "The model stops at a `stop if` rule, or after the number of steps next to the run button. Each step is one row of results: the graph and the table show all of them. Run the model with the run button, or Ctrl+Enter (⌘+Enter on a Mac) in an editor." },
                    { p: "A falling ball, for example. Start values:" },
                    { code: "t = 0        // s\ndt = 0.01    // s\ng = 9.81     // m/s²\nh = 20       // m\nv = 0        // m/s" },
                    { p: "Model rules:" },
                    { code: "a = -g\nv = v + a * dt\nh = h + v * dt\nstop if h <= 0" },
                    { p: "A smaller `dt` makes the result more precise, but takes more steps." },
                ],
            },
            {
                id: "rules",
                title: "Writing rules",
                blocks: [
                    {
                        list: [
                            "One rule per line: a name, `=`, and a calculation, like `v = v + a * dt`. The calculation uses the values as they are at that moment, so the order of the rules matters.",
                            "`+=`, `-=`, `*=` and `/=` change a value: `t += dt` means `t = t + dt`.",
                            "Names are made of letters, digits and `_`, and start with a letter or `_`. Capitals count: `V` and `v` are different quantities. The words under Conditions can't be names.",
                            "Numbers use a decimal point: `0.5` or `.5`. Powers of ten are written with e: `6.674e-11` is 6.674 × 10⁻¹¹.",
                            "Everything after `//` is a comment: a note for people, which the model skips.",
                        ],
                    },
                    {
                        head: ["Operator", "Meaning", "Example"],
                        table: [
                            ["`+`  `-`", "add, subtract", "`v + a * dt`"],
                            ["`*`  `/`", "multiply, divide", "`m * g`, `F / m`"],
                            ["`^`", "to the power", "`v^2` is v²"],
                            ["`( )`", "work this out first", "`0.5 * (v1 + v2)`"],
                        ],
                    },
                    { p: "`^` goes before `*` and `/`, and those before `+` and `-`, as in maths. `-2^2` is −4: the power comes first." },
                ],
            },
            {
                id: "conditions",
                title: "Conditions",
                blocks: [
                    { p: "With `if`, rules only apply in some steps. End the line with a colon and indent the rules that belong to it (with spaces or Tab):" },
                    { code: "if h <= 0:\n    v = -0.8 * v    // bounces back\nelse if v < -30:\n    v = -30\nelse:\n    v = v - g * dt" },
                    {
                        head: ["Comparison", "Meaning"],
                        table: [
                            ["`<`  `<=`", "less than, less than or equal to"],
                            ["`>`  `>=`", "greater than, greater than or equal to"],
                            ["`==`", "equal to"],
                            ["`!=`", "not equal to"],
                        ],
                    },
                    { p: "Combine conditions with `and`, `or` and `not`, with brackets where needed: `if not (h > 0 or v > 0):`. `stop if t >= 10` ends the model after the step in which the condition holds." },
                    { builtIn: "keywords" },
                ],
            },
            {
                id: "functions",
                title: "Functions and constants",
                blocks: [
                    { p: "Angles are in radians: the sine of 30° is `sin(30 * pi / 180)`." },
                    { builtIn: "functions" },
                    { builtIn: "constants" },
                ],
            },
            {
                id: "measured",
                title: "Measured data",
                blocks: [
                    { p: "Points you plot in a video, or in a stroboscopic photo once it has the time between two flashes, become quantities in the model. The first video's points are `x_video1` and `y_video1`, the second's `x_video2` and `y_video2`, a photo's `x_photo1` and `y_photo1`." },
                    {
                        list: [
                            "Their value is the measurement at the model's current `t`; between two points it lies on the straight line between them. Before the first and after the last point there is no value.",
                            "With a scale set on the video they are in metres (or the unit you chose), otherwise in pixels. With a scale, the pixel positions are there too: `x_video1_px` and `y_video1_px`.",
                            "Compare the model with the measurement in a rule, like `difference = h - y_video1`, or show both in one graph.",
                        ],
                    },
                ],
            },
            {
                id: "graphs",
                title: "Graphs and table",
                blocks: [
                    {
                        list: [
                            "Choose the quantity on the X axis and one or more for the Y axis. The model's values are lines, measured points are dots.",
                            "Show as table shows the same values as numbers.",
                            "Fit a curve through the model's values or the measured points: proportional, linear, quadratic, exponential, power or sine. The graph shows the formula found, and R²: the closer to 1, the better the curve fits.",
                            "Export saves the run as a spreadsheet (CSV) or the graph as an image.",
                        ],
                    },
                ],
            },
            {
                id: "language",
                title: "Dutch and English",
                blocks: [
                    { p: "Code works in Dutch and in English, even mixed. The editors show the words and functions in the language chosen in Settings, and translate code already written when you change it. Names, numbers and comments stay as they are." },
                ],
            },
        ],
    },
    nl: {
        title: "Help",
        intro: "In PhysicsGo beschrijf je hoe iets verandert in kleine stapjes tijd, en rekent de computer stap voor stap uit wat er gebeurt. Deze pagina legt uit hoe een model werkt en wat je er allemaal in kunt schrijven.",
        contents: "Inhoud",
        columns: { word: "Woord", otherLanguage: "In het Engels", meaning: "Wat het doet", function: "Functie", constant: "Constante" },
        sections: [
            {
                id: "model",
                title: "Hoe een model werkt",
                blocks: [
                    { p: "Een model heeft twee delen, elk in een eigen editor:" },
                    {
                        list: [
                            "Startwaarden worden één keer uitgevoerd, vóór de eerste stap. Geef elke grootheid haar waarde aan het begin, en de tijdstap `dt`.",
                            "Modelregels worden elke stap uitgevoerd, van boven naar beneden. Na elke stap gaat de tijd `t` omhoog met `dt`, behalve als de regels `t` zelf veranderen (met `t = t + dt`).",
                        ],
                    },
                    { p: "Het model stopt bij een regel `stop als`, of na het aantal stappen naast de knop om uit te voeren. Elke stap is een rij resultaten: de grafiek en de tabel laten ze allemaal zien. Voer het model uit met de knop, of met Ctrl+Enter (⌘+Enter op een Mac) in een editor." },
                    { p: "Bijvoorbeeld een vallende bal. Startwaarden:" },
                    { code: "t = 0        // s\ndt = 0.01    // s\ng = 9.81     // m/s²\nh = 20       // m\nv = 0        // m/s" },
                    { p: "Modelregels:" },
                    { code: "a = -g\nv = v + a * dt\nh = h + v * dt\nstop als h <= 0" },
                    { p: "Met een kleinere `dt` wordt de uitkomst nauwkeuriger, maar zijn er meer stappen nodig." },
                ],
            },
            {
                id: "rules",
                title: "Regels schrijven",
                blocks: [
                    {
                        list: [
                            "Eén regel per lijn: een naam, `=`, en een berekening, zoals `v = v + a * dt`. De berekening gebruikt de waarden zoals ze op dat moment zijn, dus de volgorde van de regels doet ertoe.",
                            "`+=`, `-=`, `*=` en `/=` veranderen een waarde: `t += dt` betekent `t = t + dt`.",
                            "Namen bestaan uit letters, cijfers en `_`, en beginnen met een letter of `_`. Hoofdletters tellen: `V` en `v` zijn verschillende grootheden. De woorden onder Voorwaarden kunnen geen naam zijn.",
                            "Getallen schrijf je met een punt: `0.5` of `.5`. Machten van tien schrijf je met e: `6.674e-11` is 6,674 × 10⁻¹¹.",
                            "Alles na `//` is commentaar: een aantekening voor mensen, die het model overslaat.",
                        ],
                    },
                    {
                        head: ["Teken", "Betekenis", "Voorbeeld"],
                        table: [
                            ["`+`  `-`", "optellen, aftrekken", "`v + a * dt`"],
                            ["`*`  `/`", "vermenigvuldigen, delen", "`m * g`, `F / m`"],
                            ["`^`", "tot de macht", "`v^2` is v²"],
                            ["`( )`", "reken dit eerst uit", "`0.5 * (v1 + v2)`"],
                        ],
                    },
                    { p: "`^` gaat voor `*` en `/`, en die gaan voor `+` en `-`, zoals bij wiskunde. `-2^2` is −4: de macht gaat eerst." },
                ],
            },
            {
                id: "conditions",
                title: "Voorwaarden",
                blocks: [
                    { p: "Met `als` gelden regels alleen in sommige stappen. Eindig de lijn met een dubbele punt en laat de regels die erbij horen inspringen (met spaties of Tab):" },
                    { code: "als h <= 0:\n    v = -0.8 * v    // stuitert terug\nanders als v < -30:\n    v = -30\nanders:\n    v = v - g * dt" },
                    {
                        head: ["Vergelijking", "Betekenis"],
                        table: [
                            ["`<`  `<=`", "kleiner dan, kleiner dan of gelijk aan"],
                            ["`>`  `>=`", "groter dan, groter dan of gelijk aan"],
                            ["`==`", "gelijk aan"],
                            ["`!=`", "niet gelijk aan"],
                        ],
                    },
                    { p: "Combineer voorwaarden met `en`, `of` en `niet`, met haakjes waar nodig: `als niet (h > 0 of v > 0):`. `stop als t >= 10` beëindigt het model na de stap waarin de voorwaarde klopt." },
                    { builtIn: "keywords" },
                ],
            },
            {
                id: "functions",
                title: "Functies en constanten",
                blocks: [
                    { p: "Hoeken zijn in radialen: de sinus van 30° is `sin(30 * pi / 180)`." },
                    { builtIn: "functions" },
                    { builtIn: "constants" },
                ],
            },
            {
                id: "measured",
                title: "Meetgegevens",
                blocks: [
                    { p: "Punten die je zet in een video, of in een stroboscopische foto zodra die de tijd tussen twee flitsen heeft, worden grootheden in het model. De punten van de eerste video zijn `x_video1` en `y_video1`, van de tweede `x_video2` en `y_video2`, van een foto `x_photo1` en `y_photo1`." },
                    {
                        list: [
                            "Hun waarde is de meting op de huidige `t` van het model; tussen twee punten ligt die op de rechte lijn ertussen. Vóór het eerste en na het laatste punt is er geen waarde.",
                            "Met een schaal op de video zijn ze in meters (of de eenheid die je koos), anders in pixels. Met een schaal zijn de pixelposities er ook: `x_video1_px` en `y_video1_px`.",
                            "Vergelijk het model met de meting in een regel, zoals `verschil = h - y_video1`, of laat beide zien in één grafiek.",
                        ],
                    },
                ],
            },
            {
                id: "graphs",
                title: "Grafieken en tabel",
                blocks: [
                    {
                        list: [
                            "Kies de grootheid op de X-as en één of meer voor de Y-as. De waarden van het model zijn lijnen, gemeten punten zijn stippen.",
                            "Als tabel tonen laat dezelfde waarden als getallen zien.",
                            "Leg een functie door de waarden van het model of de gemeten punten: recht evenredig, lineair, kwadratisch, exponentieel, macht of sinus. De grafiek toont de gevonden formule, en R²: hoe dichter bij 1, hoe beter de functie past.",
                            "Exporteren slaat de uitvoer op als spreadsheet (CSV) of de grafiek als afbeelding.",
                        ],
                    },
                ],
            },
            {
                id: "language",
                title: "Nederlands en Engels",
                blocks: [
                    { p: "Code werkt in het Nederlands en in het Engels, ook door elkaar. De editors tonen de woorden en functies in de taal die bij Instellingen gekozen is, en vertalen code die er al staat als je die verandert. Namen, getallen en commentaar blijven zoals ze zijn." },
                ],
            },
        ],
    },
};
