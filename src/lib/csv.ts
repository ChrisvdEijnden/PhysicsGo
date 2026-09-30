import type { Language } from "./useLanguage";
import type { SampleTable } from "./samples";

export type CsvCell = number | string | null | undefined;

// A table as CSV that spreadsheets open with a double click: Dutch Excel expects ";" between cells
// and a decimal comma, English "," and a decimal point. Cells without a number (NaN, Infinity,
// missing) stay empty. The byte-order mark makes Excel read the file as UTF-8.
export function toCsv(headers: string[], rows: CsvCell[][], language: Language): string {
    const separator = language === "nl" ? ";" : ",";
    const cell = (value: CsvCell) => {
        if (typeof value === "number") {
            if (!Number.isFinite(value)) return "";
            return language === "nl" ? String(value).replace(".", ",") : String(value);
        }
        if (value === null || value === undefined) return "";
        return /[";,\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
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
