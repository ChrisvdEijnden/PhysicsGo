import type { Language } from "./useLanguage";

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
    return `﻿${[headers, ...rows].map((row) => row.map(cell).join(separator)).join("\r\n")}\r\n`;
}

// Every variable of a run at every step, in the given column order (other variables after it)
export function runCsv(history: ReadonlyArray<ReadonlyMap<string, number>>, order: string[], language: Language): string {
    const names = [...order.filter((name) => history[0]?.has(name))];
    for (const state of history) {
        for (const name of state.keys()) if (!names.includes(name)) names.push(name);
    }
    return toCsv(names, history.map((state) => names.map((name) => state.get(name))), language);
}
