import { Link, useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./settings.css";
import TopBar from "../components/TopBar";
import ConfirmButton from "../components/ConfirmButton";
import SunIcon14px from "../assets/icons/sun-14px.svg";
import MoonIcon14px from "../assets/icons/moon-14px.svg";
import { useTheme } from "../lib/useTheme";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth";
import { api, errorOf } from "../lib/api";
import { authErrorKey } from "../lib/authErrors";
import { downloadFile } from "../lib/download";
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

    // Changing the password: the current one, then the new one twice. The server signs out other devices.
    const [passwordForm, setPasswordForm] = useState<{ current: string; next: string; confirm: string } | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordChanged, setPasswordChanged] = useState(false);
    const [passwordBusy, setPasswordBusy] = useState(false);

    const changePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!passwordForm || passwordBusy) return;
        if (passwordForm.next.length < 10) return setPasswordError("weak_password");
        if (passwordForm.next !== passwordForm.confirm) return setPasswordError("password_mismatch");
        setPasswordBusy(true);
        setPasswordError(null);
        const { ok, data } = await api<{ sessions: Session[] }>("/auth/password", "POST", {
            currentPassword: passwordForm.current,
            newPassword: passwordForm.next,
        });
        setPasswordBusy(false);
        if (!ok || !data.sessions) return setPasswordError(errorOf(data));
        setSessions(data.sessions);
        setPasswordForm(null);
        setPasswordChanged(true);
    };

    const setPasswordField = (field: "current" | "next" | "confirm") => (e: React.ChangeEvent<HTMLInputElement>) => {
        setPasswordForm((f) => f && { ...f, [field]: e.target.value });
        setPasswordError(null);
    };

    const endSession = (id: string) => loadSessions(api<{ sessions: Session[] }>(`/auth/sessions/${id}`, "DELETE"));
    const endOtherSessions = () => loadSessions(api<{ sessions: Session[] }>("/auth/sessions/end-others", "POST"));
    const others = sessions?.filter((s) => !s.current).length ?? 0;
    const formatTime = (ms: number) => new Date(ms).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" });

    return (
        <div>
            <TopBar crumbs={[{ label: t("nav.settings") }]}/>

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
                    <div className="password">
                        <div className="setting-row">
                            <div className="setting-row-text">
                                <h3>{t("settings.passwordTitle")}</h3>
                                <p>{passwordChanged ? t("settings.passwordChanged") : t("settings.passwordDescription")}</p>
                            </div>
                            {!passwordForm && (
                                <button
                                    type="button"
                                    className="logout-button sign-in"
                                    onClick={() => {
                                        setPasswordForm({ current: "", next: "", confirm: "" });
                                        setPasswordChanged(false);
                                    }}
                                >
                                    {t("settings.changePassword")}
                                </button>
                            )}
                        </div>
                        {passwordForm && (
                            <form className="password-form" onSubmit={changePassword}>
                                {/* Lets password managers file the new password under the right account */}
                                <input type="email" autoComplete="username" value={user.email} readOnly hidden/>
                                <label className="password-field">
                                    <span>{t("settings.currentPassword")}</span>
                                    <input type="password" autoComplete="current-password" required autoFocus
                                           value={passwordForm.current} onChange={setPasswordField("current")}/>
                                </label>
                                <label className="password-field">
                                    <span>{t("settings.newPassword")}</span>
                                    <input type="password" autoComplete="new-password" required minLength={10} maxLength={128}
                                           value={passwordForm.next} onChange={setPasswordField("next")}/>
                                </label>
                                <label className="password-field">
                                    <span>{t("settings.repeatPassword")}</span>
                                    <input type="password" autoComplete="new-password" required
                                           value={passwordForm.confirm} onChange={setPasswordField("confirm")}/>
                                </label>
                                {passwordError && <p className="session-error" role="alert">{t(authErrorKey(passwordError))}</p>}
                                <div className="password-actions">
                                    <button type="button" className="session-signout" onClick={() => {
                                        setPasswordForm(null);
                                        setPasswordError(null);
                                    }}>
                                        {t("user.cancel")}
                                    </button>
                                    <button type="submit" className="logout-button sign-in" disabled={passwordBusy}>
                                        {t("settings.savePassword")}
                                    </button>
                                </div>
                            </form>
                        )}
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
                {user && <YourData/>}
                {user && <DeleteAccount isTeacher={user.role === "teacher"}/>}
            </div>
        </div>
    );
}

// Everything stored about the user as a file, and what's stored and why
function YourData() {
    const { t } = useTranslation();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function download() {
        setBusy(true);
        setError(null);
        const { ok, data } = await api<object>("/auth/me/export");
        setBusy(false);
        if (!ok) return setError(errorOf(data));
        const file = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        downloadFile(`physicsgo-data-${new Date().toISOString().slice(0, 10)}.json`, file);
    }

    return (
        <div className="password your-data">
            <div className="setting-row">
                <div className="setting-row-text">
                    <h3>{t("settings.dataTitle")}</h3>
                    <p>{t("settings.dataDescription")} <Link to="/privacy">{t("register.privacyLink")}</Link></p>
                </div>
                <button type="button" className="logout-button sign-in" disabled={busy} onClick={download}>
                    {t("settings.downloadData")}
                </button>
            </div>
            {error && <p className="session-error" role="alert">{t(authErrorKey(error))}</p>}
        </div>
    );
}

// Deleting the account: the password, then a second confirmation. A teacher is told which classes
// need another teacher first.
function DeleteAccount({ isTeacher }: { isTeacher: boolean }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { deleteAccount } = useAuth();
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [error, setError] = useState<{ error: string; classes: string[] } | null>(null);
    const [busy, setBusy] = useState(false);

    const remove = async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        const res = await deleteAccount(password);
        setBusy(false);
        if (res.ok) navigate("/login", { replace: true });
        else setError({ error: res.error, classes: res.classes });
    };

    return (
        <div className="password delete-account">
            <div className="setting-row">
                <div className="setting-row-text">
                    <h3>{t("settings.deleteTitle")}</h3>
                    <p>{isTeacher ? t("settings.deleteDescriptionTeacher") : t("settings.deleteDescription")}</p>
                </div>
                {!open && (
                    <button type="button" className="logout-button" onClick={() => setOpen(true)}>
                        {t("settings.deleteAccount")}
                    </button>
                )}
            </div>
            {open && (
                <form className="password-form" onSubmit={(e) => e.preventDefault()}>
                    <label className="password-field">
                        <span>{t("settings.deletePassword")}</span>
                        <input type="password" autoComplete="current-password" required autoFocus
                               value={password} onChange={(e) => {
                                   setPassword(e.target.value);
                                   setError(null);
                               }}/>
                    </label>
                    {error && (
                        <p className="session-error" role="alert">
                            {error.error === "classes_need_teacher"
                                ? t("settings.deleteNeedsTeacher", { classes: error.classes.join(", ") })
                                : t(authErrorKey(error.error))}
                        </p>
                    )}
                    <div className="password-actions">
                        <button type="button" className="session-signout" onClick={() => {
                            setOpen(false);
                            setPassword("");
                            setError(null);
                        }}>
                            {t("user.cancel")}
                        </button>
                        <ConfirmButton
                            className="logout-button"
                            label={t("settings.deleteForGood")}
                            disabled={busy || !password}
                            onConfirm={remove}
                        />
                    </div>
                </form>
            )}
        </div>
    );
}

export default Settings;