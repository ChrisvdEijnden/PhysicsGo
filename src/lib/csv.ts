import type { Language } from "./useLanguage";
import type { SampleTable } from "./samples";

export type CsvCell = number | string | null | undefined;

// A table as CSV that spreadsheets open with a double click: Dutch Excel expects ";" between cells
// and a decimal comma, English "," and a decimal point. Cells without a number (NaN, Infinity,
// missing) stay empty. The byte-order mark makes Excel read the file as UTF-8.
// Text is someone's own input (a student's name), and a spreadsheet runs text that starts with
// = + - @ or a tab or line break as a formula, which can fetch websites or run commands. Such text
// gets a ' in front, which spreadsheets show as plain text.
export function toCsv(headers: string[], rows: CsvCell[][], language: Language): string {
    const separator = language === "nl" ? ";" : ",";
    const cell = (value: CsvCell) => {
        if (typeof value === "number") {
            if (!Number.isFinite(value)) return "";
            return language === "nl" ? String(value).replace(".", ",") : String(value);
        }
        if (value === null || value === undefined) return "";
        const text = /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
        return /[";,\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return `\uFEFF${[headers, ...rows].map((row) => row.map(cell).join(separator)).join("\r\n")}\r\n`;
}

// Every variable of a run at every step, in the given column order (other variables after it)
export function runCsv(run: SampleTable, order: string[], language: Language): string {
    const names = [...order.filter((name) => run.names.includes(name)), ...run.names.filter((name) => !order.includes(name))];
    const columns = names.map((name) => run.columns[run.names.indexOf(name)]);
    const rows = Array.from({ length: run.length }, (_, i) => columns.map((values) => values[i]));
    return toCsv(names, rows, language);
}
