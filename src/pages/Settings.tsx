import { useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./settings.css";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import LogoIcon26px from "../assets/icons/logo-26px.svg";
import SunIcon14px from "../assets/icons/sun-14px.svg";
import MoonIcon14px from "../assets/icons/moon-14px.svg";
import { useTheme } from "../lib/useTheme";
import { useLanguage } from "../lib/useLanguage";

function Settings() {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === "dark";
    const { language, setLanguage } = useLanguage();

    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <div className="brand">
                        <img src={LogoIcon26px} alt="LogoIcon26px"/>
                    </div>
                    <h1>PhysicsGo</h1>
                    <div className="spacer"></div>
                    <h2>Settings</h2>
                </div>
                <div className="right-system-actions">
                    <button onClick={() => navigate("/")}>
                        <img src={HelpIcon21px} alt="HelpIcon21px"/>
                    </button>
                </div>
            </div>

            <div className="content-settings">
                <div className="user">
                    <div className="user-name"></div>
                    <div className="user-email"></div>
                    <div className="user-class"></div>
                </div>
                <div className="language">
                    <div className="setting-row">
                        <div className="setting-row-text">
                            <h3>Language</h3>
                            <p>{language === "nl" ? "Dutch is selected" : "English is selected"}</p>
                        </div>
                        <div
                            className="language-toggle"
                            role="radiogroup"
                            aria-label="Language"
                            data-active={language}
                        >
                            <button
                                type="button"
                                className="language-toggle-option"
                                role="radio"
                                aria-checked={language === "nl"}
                                onClick={() => setLanguage("nl")}
                            >
                                NL
                            </button>
                            <button
                                type="button"
                                className="language-toggle-option"
                                role="radio"
                                aria-checked={language === "en"}
                                onClick={() => setLanguage("en")}
                            >
                                EN
                            </button>
                            <span className="language-toggle-thumb" aria-hidden="true"></span>
                        </div>
                    </div>
                </div>
                <div className="theme">
                    <div className="setting-row">
                        <div className="setting-row-text">
                            <h3>Appearance</h3>
                            <p>{isDark ? "Dark mode is on" : "Light mode is on"}</p>
                        </div>
                        <button
                            type="button"
                            className="theme-toggle"
                            role="switch"
                            aria-checked={isDark}
                            aria-label="Toggle dark mode"
                            onClick={toggleTheme}
                        >
                            <span className="theme-toggle-icon" aria-hidden="true">
                                <img src={SunIcon14px} alt="" />
                            </span>
                            <span className="theme-toggle-icon" aria-hidden="true">
                                <img src={MoonIcon14px} alt="" />
                            </span>
                            <span className="theme-toggle-thumb"></span>
                        </button>
                    </div>
                </div>
                <div className="logout"></div>
            </div>
        </div>
    );
}

export default Settings;