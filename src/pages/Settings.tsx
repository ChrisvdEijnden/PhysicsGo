import { useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./settings.css";
import NavBrand from "../components/NavBrand";
import NavActions from "../components/NavActions";
import SunIcon14px from "../assets/icons/sun-14px.svg";
import MoonIcon14px from "../assets/icons/moon-14px.svg";
import { useTheme } from "../lib/useTheme";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth";
import { api, errorOf } from "../lib/api";
import { authErrorKey } from "../lib/authErrors";
import type { TranslationKey } from "../lib/Translations";
import { useCallback, useEffect, useState } from "react";

interface Session {
    id: string;
    current: boolean;
    createdAt: number;
    lastSeenAt: number;
    userAgent: string;
}

// "Firefox on Windows" from a user agent string, or null when it can't be told
function describeDevice(ua: string, t: (key: TranslationKey, params?: Record<string, string>) => string) {
    const browser = /Edg\//.test(ua) ? "Edge"
        : /OPR\//.test(ua) ? "Opera"
        : /Firefox\//.test(ua) ? "Firefox"
        : /Chrome\//.test(ua) ? "Chrome"
        : /Safari\//.test(ua) ? "Safari"
        : null;
    const os = /CrOS/.test(ua) ? "ChromeOS"
        : /iPhone|iPad|iPod/.test(ua) ? "iOS"
        : /Android/.test(ua) ? "Android"
        : /Windows/.test(ua) ? "Windows"
        : /Macintosh|Mac OS X/.test(ua) ? "macOS"
        : /Linux/.test(ua) ? "Linux"
        : null;
    if (browser && os) return t("settings.deviceOn", { browser, os });
    return browser ?? os ?? t("settings.unknownDevice");
}

function Settings() {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === "dark";
    const { language, setLanguage, t } = useTranslation();
    const { user, logout } = useAuth();
    const [sessions, setSessions] = useState<Session[] | null>(null);
    const [sessionError, setSessionError] = useState<string | null>(null);

    const handleLogout = async () => {
        await logout();
        navigate("/login", { replace: true });
    };

    // Other browsers signed in to this account; ending the current one is the same as signing out
    const loadSessions = useCallback(async (request: Promise<{ ok: boolean; data: { sessions?: Session[]; error?: string } }>) => {
        const { ok, data } = await request;
        if (ok && data.sessions) {
            setSessions(data.sessions);
            setSessionError(null);
        } else {
            setSessionError(errorOf(data));
        }
    }, []);

    useEffect(() => {
        if (user) loadSessions(api<{ sessions: Session[] }>("/auth/sessions"));
    }, [user, loadSessions]);

    const endSession = (id: string) => loadSessions(api<{ sessions: Session[] }>(`/auth/sessions/${id}`, "DELETE"));
    const endOtherSessions = () => loadSessions(api<{ sessions: Session[] }>("/auth/sessions/end-others", "POST"));
    const others = sessions?.filter((s) => !s.current).length ?? 0;
    const formatTime = (ms: number) => new Date(ms).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" });

    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <NavBrand />
                    <div className="spacer"></div>
                    <h2>{t("nav.settings")}</h2>
                </div>
                <NavActions settings={false}/>
            </div>

            <div className="content-settings">
                {user ? (
                <div className="user">
                    <div className="user-top-row">
                        <div className="user-name">
                            <h3>{user.name}</h3>
                        </div>
                        <div className="user-class">
                            <h3>
                                ({user.role === "teacher" ? t("user.roleTeacher") : t("user.roleStudent")}
                                {user.classes.length > 0 && ` · ${user.classes.map((c) => c.name).join(", ")}`})
                            </h3>
                        </div>
                    </div>
                    <div className="user-email">
                        <p>{user.email}</p>
                    </div>
                </div>
                ) : (
                    <div className="user">
                        <div className="setting-row">
                            <div className="setting-row-text">
                                <h3>{t("settings.signedOutTitle")}</h3>
                                <p>{t("settings.signedOutDescription")}</p>
                            </div>
                            <button type="button" className="logout-button sign-in" onClick={() => navigate("/login")}>
                                {t("login.signIn")}
                            </button>
                        </div>
                    </div>
                )}
                <div className="language">
                    <div className="setting-row">
                        <div className="setting-row-text">
                            <h3>{t("settings.languageTitle")}</h3>
                            <p>{language === "nl" ? t("settings.dutchSelected") : t("settings.englishSelected")}</p>
                        </div>
                        <div
                            className="language-toggle"
                            role="radiogroup"
                            aria-label={t("settings.languageTitle")}
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
                {user && (
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
                )}
                {user && (
                    <div className="sessions">
                        <div className="setting-row">
                            <div className="setting-row-text">
                                <h3>{t("settings.devicesTitle")}</h3>
                                <p>{t("settings.devicesDescription")}</p>
                            </div>
                            {others > 0 && (
                                <button type="button" className="logout-button" onClick={endOtherSessions}>
                                    {t("settings.signOutOthers")}
                                </button>
                            )}
                        </div>
                        {sessionError && <p className="session-error" role="alert">{t(authErrorKey(sessionError))}</p>}
                        {sessions && (
                            <ul className="session-list">
                                {sessions.map((s) => (
                                    <li key={s.id} className="session-row">
                                        <div className="session-text">
                                            <p className="session-device">
                                                {describeDevice(s.userAgent, t)}
                                                {s.current && <span className="session-current"> · {t("settings.thisDevice")}</span>}
                                            </p>
                                            <p className="session-meta">
                                                {s.current
                                                    ? t("settings.activeNow")
                                                    : t("settings.lastActive", { time: formatTime(s.lastSeenAt) })}
                                            </p>
                                        </div>
                                        {!s.current && (
                                            <button type="button" className="session-signout" onClick={() => endSession(s.id)}>
                                                {t("settings.signOut")}
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Settings;