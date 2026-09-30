import type { Language } from "./useLanguage";

// "Fri 3 Oct, 09:00" (or "vr 3 okt, 09:00") in the interface's language
export function formatDueDate(ms: number, language: Language): string {
    return new Date(ms).toLocaleString(language, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Just the day, "Fri 3 Oct", for narrow columns
export function formatDueDay(ms: number, language: Language): string {
    return new Date(ms).toLocaleDateString(language, { weekday: "short", day: "numeric", month: "short" });
}
