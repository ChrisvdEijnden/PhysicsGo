import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

// Theme and language are chosen per device and hold for the whole app at once
export type Theme = "light" | "dark";
export type Language = "nl" | "en";

const THEME_KEY = "physicsgo_theme";
const LANGUAGE_KEY = "physicsgo_language";

function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function initialTheme(): Theme {
    const stored = read(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialLanguage(): Language {
    const stored = read(LANGUAGE_KEY);
    if (stored === "nl" || stored === "en") return stored;
    return navigator.language.toLowerCase().startsWith("nl") ? "nl" : "en";
}

interface Preferences {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    language: Language;
    setLanguage: (language: Language) => void;
}

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(initialTheme);
    const [language, setLanguageState] = useState<Language>(initialLanguage);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
    }, [theme]);

    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    const setTheme = useCallback((next: Theme) => {
        setThemeState(next);
        try { localStorage.setItem(THEME_KEY, next); } catch { /* kept for this visit only */ }
    }, []);

    const setLanguage = useCallback((next: Language) => {
        setLanguageState(next);
        try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* kept for this visit only */ }
    }, []);

    const value = useMemo(() => ({ theme, setTheme, language, setLanguage }), [theme, setTheme, language, setLanguage]);
    return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
    const ctx = useContext(PreferencesContext);
    if (!ctx) throw new Error("usePreferences must be used inside <PreferencesProvider>");
    return ctx;
}
