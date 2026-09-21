export interface LineDataPoint {
    t: number;
    omega: number;
}

export const lineData: LineDataPoint[] = [
    { t: 0, omega: 35 },
    { t: 1, omega: 28 },
    { t: 2, omega: 34 },
    { t: 3, omega: 32 },
    { t: 4, omega: 40 },
    { t: 5, omega: 32 },
    { t: 6, omega: 35 },
    { t: 7, omega: 55 },
    { t: 8, omega: 38 },
    { t: 9, omega: 30 },
    { t: 10, omega: 25 },
    { t: 11, omega: 32 },
];

function formatDomainValue(value: number): number | string {
    if (value === Infinity) return "∞";
    if (value === -Infinity) return "−∞";

    return value;
}

export const minDomainLineData = formatDomainValue(
    Math.min(...lineData.map(point => point.t))
);

export const maxDomainLineData = formatDomainValue(
    Math.max(...lineData.map(point => point.t))
);

export const minRangeLineData = formatDomainValue(
    Math.min(...lineData.map(point => point.omega))
);

export const maxRangeLineData = formatDomainValue(
    Math.max(...lineData.map(point => point.omega))
);