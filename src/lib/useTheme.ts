import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "physicsgo-theme";

function getStoredTheme(): Theme {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
    document.documentElement.setAttribute("data-theme", theme);
}

export function initTheme() {
    applyTheme(getStoredTheme());
}

export function useTheme() {
    const [theme, setThemeState] = useState<Theme>(getStoredTheme);

    useEffect(() => {
        applyTheme(theme);
        window.localStorage.setItem(STORAGE_KEY, theme);
    }, [theme]);

    const setTheme = useCallback((next: Theme) => setThemeState(next), []);

    const toggleTheme = useCallback(() => {
        setThemeState((prev) => (prev === "light" ? "dark" : "light"));
    }, []);

    return { theme, setTheme, toggleTheme };
}