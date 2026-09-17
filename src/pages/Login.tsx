import { useNavigate } from "react-router-dom";
import { useRef, useState, useEffect } from "react";

import "../styles/global.css";
import "./login.css"

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import LogoIcon26px from "../assets/icons/logo-26px.svg";
import LogoIcon35px from "../assets/icons/logo-35px.svg";
import LogoIcon750px from "../assets/icons/logo-750px.svg";

const CODE_LENGTH = 12;
const DASH_AFTER = [3, 7];

function Login() {
    const navigate = useNavigate();
    const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const isComplete = code.every((c) => c !== "");

    const saveCode = (fullCode: string) => {
        // Placeholder persistence
        localStorage.setItem("physicsgo_login_code", fullCode);
    };

    useEffect(() => {
        if (isComplete) {
            saveCode(code.join(""));
            navigate("/dashboard");
        }
    }, [code, isComplete]);

    const handleChange = (index: number, value: string) => {
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
                    <h2>Login</h2>
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
                        <h3>Enter your invitation or teacher's code to open your workspace.</h3>
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
                    <div className="footer-context">
                        <p>PhysicsGo v0.1 · C.H.M. van den Eijnden · J.J. van Wegen</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Login;