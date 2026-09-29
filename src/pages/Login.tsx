import { useNavigate } from "react-router-dom";
import { useState } from "react";

import "../styles/global.css";
import "./login.css";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import NavBrand from "../components/NavBrand";
import LogoIcon35px from "../assets/icons/logo-35px.svg";
import LogoIcon750px from "../assets/icons/logo-750px.svg";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth.tsx";
import { authErrorKey } from "../lib/authErrors";
import CodeInput from "../components/CodeInput";

function Login() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { checkCode } = useAuth();
    const [error, setError] = useState<string | null>(null);

    const handleComplete = async (code: string) => {
        const res = await checkCode(code);
        if (!res.ok) {
            setError(res.error);
            return false;
        }
        navigate("/register", { state: { code, info: res.info }, replace: true });
        return true;
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
                <div className="auth-card">
                    <div className="header-group">
                        <div className="full-brand">
                            <div className="brand">
                                <img src={LogoIcon35px} alt="LogoIcon35px"/>
                            </div>
                            <h1>PhysicsGo</h1>
                        </div>
                        <h3>{t("login.invitationPrompt")}</h3>
                    </div>
                    <CodeInput onComplete={handleComplete} onEdit={() => setError(null)} />
                    <div className="auth-actions">
                        {error && (
                            <p className="auth-error" role="alert">
                                {t(authErrorKey(error))}
                            </p>
                        )}
                        <button className="auth-link" type="button" onClick={() => navigate("/login")}>
                            {t("login.haveAccount")}
                        </button>
                    </div>
                    <div className="footer-context">
                        <p>PhysicsGo v1.1 · C.H.M. van den Eijnden · J.J. van Wegen</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Login;