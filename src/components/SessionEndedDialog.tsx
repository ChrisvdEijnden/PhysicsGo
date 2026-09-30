import { useState } from "react";

import "../pages/classes.css";

import Dialog from "./Dialog";
import { useAuth } from "../lib/useAuth";
import { authErrorKey } from "../lib/authErrors";
import { useTranslation } from "../lib/useTranslations";

// Shown over the current page when the session ended while someone was working (idle too long, or
// signed out from another device). The page stays open: unsaved work is kept on this device, and
// signing in again as the same person sends it to the server.
export default function SessionEndedDialog() {
    const { user, sessionEnded, login, logout } = useAuth();
    if (!user || !sessionEnded) return null;
    return <SignInAgain email={user.email} login={login} logout={logout}/>;
}

function SignInAgain({ email: accountEmail, login, logout }: {
    email: string;
    login: ReturnType<typeof useAuth>["login"];
    logout: ReturnType<typeof useAuth>["logout"];
}) {
    const { t } = useTranslation();
    const [email, setEmail] = useState(accountEmail);
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        const res = await login(email, password);
        setBusy(false);
        if (!res.ok) setError(res.error);
    };

    return (
        // It stays until they sign in again or sign out: Escape and clicking next to it don't close it
        <Dialog labelledBy="session-ended-title" describedBy="session-ended-description" alert>
            <form className="dialog-form" onSubmit={submit}>
                <div className="dialog-header">
                    <h2 id="session-ended-title">{t("session.endedTitle")}</h2>
                    <p id="session-ended-description">{t("session.endedDescription")}</p>
                </div>
                <label className="dialog-field">
                    <span>{t("user.email")}</span>
                    <input className="class-input" type="email" autoComplete="username" required
                           value={email} onChange={(e) => setEmail(e.target.value)}/>
                </label>
                <label className="dialog-field">
                    <span>{t("auth.password")}</span>
                    <input className="class-input" type="password" autoComplete="current-password" required data-autofocus
                           value={password} onChange={(e) => setPassword(e.target.value)}/>
                </label>
                {error && <p className="auth-error class-error" role="alert">{t(authErrorKey(error))}</p>}
                <div className="dialog-actions">
                    <button type="button" className="class-button" onClick={logout}>
                        {t("settings.logout")}
                    </button>
                    <button type="submit" className="class-button primary" disabled={busy}>
                        {t("login.signIn")}
                    </button>
                </div>
            </form>
        </Dialog>
    );
}
