import { usePreferences } from "./preferences";

export type { Language } from "./preferences";

export function useLanguage() {
    const { language, setLanguage } = usePreferences();
    const toggleLanguage = () => setLanguage(language === "nl" ? "en" : "nl");
    return { language, setLanguage, toggleLanguage };
}
