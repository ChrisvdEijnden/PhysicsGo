// Units written in the code, for axis titles and table headings: the comment after a start value or
// rule, like `h = 10 // m` or `v = 0 // m/s, upwards is positive`. The unit is the comment's first
// part (before a comma) when it looks like a unit: short, no spaces, and either a few letters (m, kg,
// rad, mbar) or with a symbol in it (m/s², N·m, °C). A description like `// height` isn't one.
// The first line that gives a quantity a unit counts. t takes dt's unit when it has none of its own.

const ASSIGNMENT = /^\s*([A-Za-z_]\w*)\s*[-+*/]?=(?!=)/;

export function unitOf(comment: string): string | null {
    const first = comment.split(",")[0].trim().replace(/^\[(.*)\]$/, "$1");
    if (!first || first.length > 10 || /\s/.test(first)) return null;
    if (/^\p{L}+$/u.test(first)) return first.length <= 4 ? first : null;
    return first;
}

export function codeUnits(source: string): Map<string, string> {
    const units = new Map<string, string>();
    for (const line of source.split("\n")) {
        const comment = line.indexOf("//");
        if (comment === -1) continue;
        const name = ASSIGNMENT.exec(line.slice(0, comment))?.[1];
        const unit = name && !units.has(name) ? unitOf(line.slice(comment + 2)) : null;
        if (name && unit) units.set(name, unit);
    }
    const dt = units.get("dt");
    if (dt && !units.has("t")) units.set("t", dt);
    return units;
}

// "h (m)", or just "h" without a unit
export const withUnit = (name: string, unit: string | undefined) => (unit ? `${name} (${unit})` : name);
