// Values to plot: one column per variable, the same length each (a step of a run, or a plotted point).
// Columns keep long runs compact; a missing value is NaN.
export interface Samples {
    length: number;
    names: string[];
    column: (name: string) => ArrayLike<number> | undefined;
}

export function columnSamples(names: string[], columns: ArrayLike<number>[]): Samples {
    const byName = new Map(names.map((name, i) => [name, columns[i]]));
    return { length: columns[0]?.length ?? 0, names, column: (name) => byName.get(name) };
}

// From one record per sample, e.g. points plotted on a video
export function rowSamples(rows: Record<string, number>[], names: string[]): Samples {
    return columnSamples(names, names.map((name) => Float64Array.from(rows, (r) => r[name] ?? NaN)));
}
