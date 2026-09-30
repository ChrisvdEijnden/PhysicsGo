import { useState } from "react";
import { useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./login.css";

import TopBar from "../components/TopBar";
import Credits from "../components/Credits";
import LogoIcon35px from "../assets/icons/logo-35px.svg";
import LogoIcon750px from "../assets/icons/logo-750px.svg";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth";
import { authErrorKey } from "../lib/authErrors";
import CodeInput from "../components/CodeInput";

// Setting a new password with a one-time reset code: students get one from their teacher,
// teachers from whoever manages PhysicsGo
function ResetPassword() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { checkResetCode, resetPassword } = useAuth();
    const [code, setCode] = useState<string | null>(null);
    const [account, setAccount] = useState<{ name: string; email: string } | null>(null);
    const [form, setForm] = useState({ password: "", confirm: "" });
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const handleCode = async (entered: string) => {
        const res = await checkResetCode(entered);
        if (!res.ok) {
            setError(res.error);
            return false;
        }
        setError(null);
        setCode(entered);
        setAccount(res.account);
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || !code) return;
        if (form.password.length < 10) return setError("weak_password");
        if (form.password !== form.confirm) return setError("password_mismatch");

        setBusy(true);
        setError(null);
        const res = await resetPassword(code, form.password);
        setBusy(false);
        // Signed in on success; the effect above then goes to the dashboard
        if (!res.ok) setError(res.error);
    };

    return (
        <div className="page-auth">
            <img className="background-logo" src={LogoIcon750px} alt="" />
            <TopBar crumbs={[{ label: t("nav.resetPassword") }]}/>
            <div className="content">
                <form className="auth-card" onSubmit={handleSubmit}>
                    <div className="header-group">
                        <div className="full-brand">
                            <div className="brand">
                                <img src={LogoIcon35px} alt=""/>
                            </div>
                            <h1>PhysicsGo</h1>
                        </div>
                        <h3>
                            {account
                                ? t("reset.passwordPrompt", { name: account.name, email: account.email })
                                : t("reset.codePrompt")}
                        </h3>
                    </div>
                    {account ? (
                        <div className="info info-wide">
                            <label className="info-row">
                                <span className="info-label">{t("auth.password")}</span>
                                <input className="info-input" type="password" autoComplete="new-password" required
                                       minLength={10} value={form.password}
                                       onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                            </label>
                            <label className="info-row">
                                <span className="info-label">{t("auth.confirmPassword")}</span>
                                <input className="info-input" type="password" autoComplete="new-password" required
                                       value={form.confirm}
                                       onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} />
                            </label>
                        </div>
                    ) : (
                        <>
                            <CodeInput onComplete={handleCode} onEdit={() => setError(null)} />
                            <p className="info-hint reset-help">{t("reset.codeHelp")}</p>
                        </>
                    )}
                    <div className="auth-actions">
                        {error && <p className="auth-error" role="alert">{t(authErrorKey(error))}</p>}
                        {account && (
                            <button className="auth-button" type="submit" disabled={busy}>
                                {t("reset.submit")}
                            </button>
                        )}
                        <button className="auth-link" type="button" onClick={() => navigate("/login")}>
                            {t("reset.backToLogin")}
                        </button>
                    </div>
                    <Credits/>
                </form>
            </div>
        </div>
    );
}

export default ResetPassword;
