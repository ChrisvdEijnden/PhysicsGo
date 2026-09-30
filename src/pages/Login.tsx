import { useNavigate } from "react-router-dom";
import { useState } from "react";

import "../styles/global.css";
import "./login.css";

import TopBar from "../components/TopBar";
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
            <img className="background-logo" src={LogoIcon750px} alt="" />
            <TopBar crumbs={[{ label: t("nav.login") }]}/>
            <div className="content">
                <div className="auth-card">
                    <div className="header-group">
                        <div className="full-brand">
                            <div className="brand">
                                <img src={LogoIcon35px} alt=""/>
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