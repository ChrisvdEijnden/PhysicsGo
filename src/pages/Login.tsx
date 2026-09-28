import { useNavigate } from "react-router-dom";
import { useRef, useState, useEffect } from "react";

import "../styles/global.css";
import "./login.css";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import LogoIcon26px from "../assets/icons/logo-26px.svg";
import LogoIcon35px from "../assets/icons/logo-35px.svg";
import LogoIcon750px from "../assets/icons/logo-750px.svg";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth.tsx";
import { authErrorKey } from "../lib/authErrors";

const CODE_LENGTH = 12;
const DASH_AFTER = [3, 7];

function Login() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { checkCode } = useAuth();
    const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
    const [error, setError] = useState<string | null>(null);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const isComplete = code.every((c) => c !== "");

    useEffect(() => {
        if (!isComplete) return;

        // Ignore the response if the code changed or the page was left while waiting
        let cancelled = false;
        const value = code.join("");

        checkCode(value).then((res) => {
            if (cancelled) return;
            if (res.ok) {
                navigate("/register", { state: { code: value }, replace: true });
            } else {
                setError(res.error);
                setCode(Array(CODE_LENGTH).fill(""));
                inputRefs.current[0]?.focus();
            }
        });

        return () => {
            cancelled = true;
        };
    }, [code, isComplete, checkCode, navigate]);

    const handleChange = (index: number, value: string) => {
        setError(null);
        const char = value.slice(-1).toUpperCase();
        setCode((prev) => {
            const next = [...prev];
            next[index] = char;
            return next;
        });
        if (char && index < CODE_LENGTH - 1) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    return (
        <div>
            <img className="background-logo" src={LogoIcon750px} alt="LogoIcon750px" />
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <div className="brand">
                        <img src={LogoIcon26px} alt="LogoIcon26px"/>
                    </div>
                    <h1>PhysicsGo</h1>
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
                    <div className="access-code">
                        {code.map((char, index) => (
                            <div key={index} style={{ display: "contents" }}>
                                <div className="char-slot">
                                    <input
                                        type="text"
                                        id={`char-${index}`}
                                        maxLength={1}
                                        value={char}
                                        ref={(el) => { inputRefs.current[index] = el; }}
                                        onChange={(e) => handleChange(index, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(index, e)}
                                    />
                                </div>
                                {DASH_AFTER.includes(index) && <div className="dash"></div>}
                            </div>
                        ))}
                    </div>
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