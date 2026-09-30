// Values per variable with one row per sample: a run's recorded steps, or the points plotted on a
// video or photo. Columns (rather than a list of rows) keep a million-step run compact.
export interface SampleTable {
    names: string[];
    columns: ArrayLike<number>[];
    length: number;
}

export function column(table: SampleTable, name: string): ArrayLike<number> | undefined {
    const i = table.names.indexOf(name);
    return i === -1 ? undefined : table.columns[i];
}

// The value of `name` at row `row`, or undefined when there isn't a usable one
export function valueAt(table: SampleTable, name: string, row: number): number | undefined {
    const value = column(table, name)?.[row];
    return value !== undefined && Number.isFinite(value) ? value : undefined;
}

// A table from rows of named values; a name missing from a row is left empty (NaN) there
export function tableFromRows(rows: ReadonlyArray<ReadonlyMap<string, number>>): SampleTable {
    const names: string[] = [];
    for (const row of rows) for (const name of row.keys()) if (!names.includes(name)) names.push(name);
    return {
        names,
        columns: names.map((name) => Float64Array.from(rows, (row) => row.get(name) ?? NaN)),
        length: rows.length,
    };
}
