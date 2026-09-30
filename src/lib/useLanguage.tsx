import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Language = "nl" | "en";

// index.html reads the same key to set the page language before the first paint
const STORAGE_KEY = "physicsgo_language";

function getInitialLanguage(): Language {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === "nl" || stored === "en") return stored;
    } catch {
        // Storage can be blocked; fall back to the browser's language
    }
    return navigator.language.toLowerCase().startsWith("nl") ? "nl" : "en";
}

interface LanguageContextValue {
    language: Language;
    setLanguage: (lang: Language) => void;
    toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

// One language for the whole app: switching it in Settings changes every mounted component at once
export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguage] = useState<Language>(getInitialLanguage);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, language);
        } catch {
            // Not remembered, but still applied
        }
        document.documentElement.lang = language;
    }, [language]);

    const value = useMemo(() => ({
        language,
        setLanguage,
        toggleLanguage: () => setLanguage((prev) => (prev === "nl" ? "en" : "nl")),
    }), [language]);

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
    const ctx = useContext(LanguageContext);
    if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
    return ctx;
}
