import { useLanguage } from "./useLanguage";
import { translations, TranslationKey } from "./Translations.ts";

export function useTranslation() {
    const { language, setLanguage, toggleLanguage } = useLanguage();

    const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
        let str: string = translations[language][key] ?? translations.en[key] ?? key;
        if (params) {
            for (const [name, value] of Object.entries(params)) {
                str = str.replace(new RegExp(`{{${name}}}`, "g"), String(value));
            }
        }
        return str;
    };

    return { t, language, setLanguage, toggleLanguage };
}