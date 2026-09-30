import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./login.css";

import TopBar from "../components/TopBar";
import Credits from "../components/Credits";
import LogoIcon35px from "../assets/icons/logo-35px.svg";
import LogoIcon750px from "../assets/icons/logo-750px.svg";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth";
import type { CodeInfo } from "../lib/useAuth";
import { authErrorKey } from "../lib/authErrors";

function Register() {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const { register } = useAuth();
    const code: string | undefined = location.state?.code;
    const info: CodeInfo | undefined = location.state?.info;

    const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!code) navigate("/join", { replace: true });
    }, [code, navigate]);

    const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [field]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || !code) return;
        if (form.password.length < 10) return setError("weak_password");
        if (form.password !== form.confirm) return setError("password_mismatch");

        setBusy(true);
        setError(null);
        const res = await register({ code, name: form.name, email: form.email, password: form.password });
        setBusy(false);

        // A code error here means the class code was regenerated or closed after it was checked
        if (res.ok) navigate("/dashboard", { replace: true });
        else setError(res.error);
    };

    return (
        <div>
            <img className="background-logo" src={LogoIcon750px} alt="" />
            <TopBar crumbs={[{ label: t("nav.register") }]}/>

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
                            {info?.kind === "teacher"
                                ? t("register.teacherPrompt")
                                : info?.kind === "class"
                                    ? t("register.classPrompt", { name: info.className })
                                    : t("register.prompt")}
                        </h3>
                    </div>
                    <div className="info info-wide">
                        <label className="info-row">
                            <span className="info-label">{t("user.name")}</span>
                            <input className="info-input" type="text" autoComplete="name" required
                                   value={form.name} onChange={set("name")} />
                        </label>
                        <label className="info-row">
                            <span className="info-label">{t("user.email")}</span>
                            <input className="info-input" type="email" autoComplete="username" required
                                   value={form.email} onChange={set("email")} />
                        </label>
                        <label className="info-row">
                            <span className="info-label">{t("auth.password")}</span>
                            <input className="info-input" type="password" autoComplete="new-password" required
                                   minLength={10} value={form.password} onChange={set("password")} />
                        </label>
                        <label className="info-row">
                            <span className="info-label">{t("auth.confirmPassword")}</span>
                            <input className="info-input" type="password" autoComplete="new-password" required
                                   value={form.confirm} onChange={set("confirm")} />
                        </label>
                    </div>
                    <div className="auth-actions">
                        {error && <p className="auth-error" role="alert">{t(authErrorKey(error))}</p>}
                        <button className="auth-button" type="submit" disabled={busy}>
                            {t("register.submit")}
                        </button>
                    </div>
                    <Credits/>
                </form>
            </div>
        </div>
    );
}

export default Register;