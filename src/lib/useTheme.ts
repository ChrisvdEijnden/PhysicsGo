import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "physicsgo_theme";

function getInitialTheme(): Theme {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
        return stored;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
    const [theme, setThemeState] = useState<Theme>(getInitialTheme);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, theme);
        document.documentElement.setAttribute("data-theme", theme);
    }, [theme]);

    const setTheme = (next: Theme) => setThemeState(next);
    const toggleTheme = () => setThemeState((prev) => (prev === "dark" ? "light" : "dark"));

    return { theme, setTheme, toggleTheme };
}