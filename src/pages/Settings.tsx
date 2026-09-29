import { useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./settings.css";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import NavBrand from "../components/NavBrand";
import SunIcon14px from "../assets/icons/sun-14px.svg";
import MoonIcon14px from "../assets/icons/moon-14px.svg";
import { useTheme } from "../lib/useTheme";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth";
import {useEffect} from "react";

function Settings() {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === "dark";
    const { language, setLanguage, t } = useTranslation();
    const { user, logout } = useAuth();

    const handleLogout = async () => {
        await logout();
        navigate("/login", { replace: true });
    };

    useEffect(() => {
        if (!user) navigate("/login", { replace: true });
    }, [user, navigate]);

    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <NavBrand />
                    <div className="spacer"></div>
                    <h2>{t("nav.settings")}</h2>
                </div>
                <div className="right-system-actions">
                    <button onClick={() => navigate("/")}>
                        <img src={HelpIcon21px} alt="HelpIcon21px"/>
                    </button>
                </div>
            </div>

            <div className="content-settings">
                <div className="user">
                    <div className="user-top-row">
                        <div className="user-name">
                            <h3>{user?.name ?? "—"}</h3>
                        </div>
                        {user && (
                            <div className="user-class">
                                <h3>
                                    ({user.role === "teacher" ? t("user.roleTeacher") : t("user.roleStudent")}
                                    {user.classes.length > 0 && ` · ${user.classes.map((c) => c.name).join(", ")}`})
                                </h3>
                            </div>
                        )}
                    </div>
                    <div className="user-email">
                        <p>{user?.email ?? "—"}</p>
                    </div>
                </div>
                <div className="language">
                    <div className="setting-row">
                        <div className="setting-row-text">
                            <h3>{t("settings.languageTitle")}</h3>
                            <p>{language === "nl" ? t("settings.dutchSelected") : t("settings.englishSelected")}</p>
                        </div>
                        <div
                            className="language-toggle"
                            role="radiogroup"
                            aria-label="Language"
                            data-active={language}
                        >
                            <button
                                type="button"
                                className="language-toggle-option"
                                role="radio"
                                aria-checked={language === "nl"}
                                onClick={() => setLanguage("nl")}
                            >
                                NL
                            </button>
                            <button
                                type="button"
                                className="language-toggle-option"
                                role="radio"
                                aria-checked={language === "en"}
                                onClick={() => setLanguage("en")}
                            >
                                EN
                            </button>
                            <span className="language-toggle-thumb" aria-hidden="true"></span>
                        </div>
                    </div>
                </div>
                <div className="theme">
                    <div className="setting-row">
                        <div className="setting-row-text">
                            <h3>{t("settings.appearanceTitle")}</h3>
                            <p>{isDark ? t("settings.darkModeOn") : t("settings.lightModeOn")}</p>
                        </div>
                        <button
                            type="button"
                            className="theme-toggle"
                            role="switch"
                            aria-checked={isDark}
                            aria-label={t("settings.toggleDarkMode")}
                            onClick={toggleTheme}
                        >
                            <span className="theme-toggle-icon" aria-hidden="true">
                                <img src={SunIcon14px} alt="" />
                            </span>
                            <span className="theme-toggle-icon" aria-hidden="true">
                                <img src={MoonIcon14px} alt="" />
                            </span>
                            <span className="theme-toggle-thumb"></span>
                        </button>
                    </div>
                </div>
                <div className="logout">
                    <div className="setting-row">
                        <div className="setting-row-text">
                            <h3>{t("settings.logoutTitle")}</h3>
                            <p>{t("settings.logoutDescription")}</p>
                        </div>
                        <button type="button" className="logout-button" onClick={handleLogout}>
                            {t("settings.logout")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Settings;