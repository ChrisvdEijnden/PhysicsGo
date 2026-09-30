import { usePreferences } from "./preferences";

export type { Theme } from "./preferences";

export function useTheme() {
    const { theme, setTheme } = usePreferences();
    const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");
    return { theme, setTheme, toggleTheme };
}
