import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatRelativeDate } from "./formatRelativeDate";

describe("formatRelativeDate", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 30, 12, 0, 0));
    });
    afterEach(() => vi.useRealTimers());

    it("says 'now' for the last minute and slightly future times", () => {
        expect(formatRelativeDate(new Date(2026, 8, 30, 11, 59, 30), "en")).toBe("now");
        expect(formatRelativeDate(new Date(2026, 8, 30, 12, 0, 20), "nl")).toBe("nu");
    });

    it("counts minutes and hours in the interface language", () => {
        expect(formatRelativeDate(new Date(2026, 8, 30, 11, 45), "en")).toBe("15 minutes ago");
        expect(formatRelativeDate(new Date(2026, 8, 30, 9, 0), "nl")).toBe("3 uur geleden");
    });

    it("uses calendar days, so last night is yesterday", () => {
        expect(formatRelativeDate(new Date(2026, 8, 29, 23, 0), "en")).toBe("13 hours ago");
        expect(formatRelativeDate(new Date(2026, 8, 29, 8, 0), "en")).toBe("yesterday");
        expect(formatRelativeDate(new Date(2026, 8, 29, 8, 0), "nl")).toBe("gisteren");
    });

    it("shows a date for anything older than a week", () => {
        expect(formatRelativeDate(new Date(2026, 8, 1, 8, 0), "en")).toBe("Sep 1, 2026");
    });
});
