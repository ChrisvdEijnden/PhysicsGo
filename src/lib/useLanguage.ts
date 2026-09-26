import { useEffect, useState } from "react";

export type Language = "nl" | "en";

const STORAGE_KEY = "physicsgo_language";

function getInitialLanguage(): Language {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "nl" || stored === "en") {
        return stored;
    }
    return navigator.language.toLowerCase().startsWith("nl") ? "nl" : "en";
}

export function useLanguage() {
    const [language, setLanguageState] = useState<Language>(getInitialLanguage);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, language);
        document.documentElement.lang = language;
    }, [language]);

    const setLanguage = (lang: Language) => setLanguageState(lang);
    const toggleLanguage = () => setLanguageState((prev) => (prev === "nl" ? "en" : "nl"));

    return { language, setLanguage, toggleLanguage };
}