import type { Language } from "./useLanguage";

// "3 minutes ago", "yesterday" (or "3 minuten geleden", "gisteren") in the interface's language;
// anything older than a week is shown as a date
export function formatRelativeDate(date: Date, language: Language): string {
    if (isNaN(date.getTime())) return "—";

    const relative = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    const minutes = Math.floor(diffMs / 60_000);
    const hours = Math.floor(minutes / 60);

    // Less than a minute ago, or slightly ahead because another device's clock is
    if (minutes < 1) return relative.format(0, "second");
    if (minutes < 60) return relative.format(-minutes, "minute");
    if (hours < 24) return relative.format(-hours, "hour");

    // Calendar days rather than 24-hour blocks, so last night is "yesterday" (handles DST and month ends)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 7) return relative.format(-diffDays, "day");
    return date.toLocaleDateString(language, { dateStyle: "medium" });
}
