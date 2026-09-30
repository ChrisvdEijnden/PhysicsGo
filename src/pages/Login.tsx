import { useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";

import "../styles/global.css";
import "./login.css";

import TopBar from "../components/TopBar";
import Credits from "../components/Credits";
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
    // A join link (#/join?code=…) fills in the code and checks it right away
    const [params] = useSearchParams();

    const handleComplete = async (code: string) => {
        const res = await checkCode(code);
        if (!res.ok) {
            setError(res.error);
            return false;
        }
        // The code goes in the address too, so reloading the registration page keeps it
        navigate(`/register?code=${code}`, { state: { code, info: res.info }, replace: true });
        return true;
    };

    return (
        <div className="page-auth">
            <img className="background-logo" src={LogoIcon750px} alt="" />
            <TopBar title={t("nav.login")}/>
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
                    <CodeInput key={params.get("code") ?? ""} onComplete={handleComplete} onEdit={() => setError(null)}
                               initial={params.get("code") ?? ""} errorId="code-error"/>
                    <div className="auth-actions">
                        {error && (
                            <p className="auth-error" role="alert" id="code-error">
                                {t(authErrorKey(error))}
                            </p>
                        )}
                        <button className="auth-link" type="button" onClick={() => navigate("/login")}>
                            {t("login.haveAccount")}
                        </button>
                    </div>
                    <Credits/>
                </div>
            </div>
        </div>
    );
}

export default Login;