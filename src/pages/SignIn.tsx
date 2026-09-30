import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./login.css";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import NavBrand from "../components/NavBrand";
import LogoIcon35px from "../assets/icons/logo-35px.svg";
import LogoIcon750px from "../assets/icons/logo-750px.svg";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth";
import { authErrorKey } from "../lib/authErrors";

function SignIn() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { user, login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (user) navigate("/dashboard", { replace: true });
    }, [user, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        const res = await login(email, password);
        setBusy(false);
        if (!res.ok) setError(res.error);
    };

    return (
        <div>
            <img className="background-logo" src={LogoIcon750px} alt="LogoIcon750px" />
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <NavBrand />
                    <div className="spacer"></div>
                    <h2>{t("nav.login")}</h2>
                </div>
                <div className="right-system-actions">
                    <button onClick={() => navigate("/settings")}>
                        <img src={SettingsIcon21px} alt="SettingsIcon21px"/>
                    </button>
                    <button onClick={() => navigate("/")}>
                        <img src={HelpIcon21px} alt="HelpIcon21px"/>
                    </button>
                </div>
            </div>

            <div className="content">
                <form className="auth-card" onSubmit={handleSubmit}>
                    <div className="header-group">
                        <div className="full-brand">
                            <div className="brand">
                                <img src={LogoIcon35px} alt="LogoIcon35px"/>
                            </div>
                            <h1>PhysicsGo</h1>
                        </div>
                        <h3>{t("login.signInPrompt")}</h3>
                    </div>
                    <div className="info info-wide">
                        <label className="info-row">
                            <span className="info-label">{t("user.email")}</span>
                            <input
                                className="info-input"
                                type="email"
                                autoComplete="username"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </label>
                        <label className="info-row">
                            <span className="info-label">{t("auth.password")}</span>
                            <input
                                className="info-input"
                                type="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </label>
                    </div>
                    <div className="auth-actions">
                        {error && <p className="auth-error" role="alert">{t(authErrorKey(error))}</p>}
                        <button className="auth-button" type="submit" disabled={busy}>
                            {t("login.signIn")}
                        </button>
                        <button className="auth-link" type="button" onClick={() => navigate("/join")}>
                            {t("login.noAccount")}
                        </button>
                        <button className="auth-link" type="button" onClick={() => navigate("/reset")}>
                            {t("login.forgotPassword")}
                        </button>
                    </div>
                    <div className="footer-context">
                        <p>PhysicsGo v1.1 · C.H.M. van den Eijnden · J.J. van Wegen</p>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default SignIn;