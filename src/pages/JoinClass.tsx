import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./login.css";
import "./classes.css";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import NavBrand from "../components/NavBrand";
import LogoIcon35px from "../assets/icons/logo-35px.svg";
import LogoIcon750px from "../assets/icons/logo-750px.svg";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth";
import type { ClassRef } from "../lib/useAuth";
import { authErrorKey } from "../lib/authErrors";
import CodeInput from "../components/CodeInput";

// Lets a signed-in student join another class with the code their teacher shared
function JoinClass() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { user, loading, joinClass } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const [joined, setJoined] = useState<ClassRef | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (loading) return;
        if (!user) navigate("/login", { replace: true });
        else if (user.role === "teacher") navigate("/classes", { replace: true });
    }, [loading, user, navigate]);

    const handleComplete = async (code: string) => {
        const res = await joinClass(code);
        if (!res.ok) {
            setError(res.error);
            return false;
        }
        setJoined(res.joined);
        return true;
    };

    const joinAnother = () => {
        setJoined(null);
        setAttempt((n) => n + 1); // remounts the code input empty
    };

    if (loading || !user) return null;

    return (
        <div>
            <img className="background-logo" src={LogoIcon750px} alt="LogoIcon750px" />
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <NavBrand />
                    <div className="spacer"></div>
                    <h2 className="breadcrumb-link" onClick={() => navigate("/dashboard")}>{t("nav.dashboard")}</h2>
                    <div className="spacer"></div>
                    <h2>{t("nav.joinClass")}</h2>
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
                        <h3>{t("joinClass.prompt")}</h3>
                    </div>
                    {joined
                        ? <p className="join-success" role="status">{t("joinClass.success", { name: joined.name })}</p>
                        : <CodeInput key={attempt} onComplete={handleComplete} onEdit={() => setError(null)} />}
                    {user.classes.length > 0 && (
                        <div className="class-chip-list" aria-label={t("dashboard.yourClasses")}>
                            {user.classes.map((c) => <span key={c.id} className="class-chip">{c.name}</span>)}
                        </div>
                    )}
                    <div className="auth-actions">
                        {error && <p className="auth-error" role="alert">{t(authErrorKey(error))}</p>}
                        {joined && (
                            <button className="auth-button" type="button" onClick={() => navigate("/dashboard")}>
                                {t("joinClass.backToDashboard")}
                            </button>
                        )}
                        <button
                            className="auth-link"
                            type="button"
                            onClick={joined ? joinAnother : () => navigate("/dashboard")}
                        >
                            {joined ? t("joinClass.joinAnother") : t("joinClass.backToDashboard")}
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

export default JoinClass;
