import "../styles/global.css";
import "./login.css";

import NavBrand from "../components/NavBrand";
import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import {useNavigate} from "react-router-dom";
import {useTranslation} from "../lib/useTranslations.ts";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth";
import LogoIcon750px from "../assets/icons/logo-750px.svg";
import LogoIcon35px from "../assets/icons/logo-35px.svg";

function User() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [draft, setDraft] = useState({ name: "", email: "" });
    const { user, loading, updateUser } = useAuth();

    useEffect(() => {
        if (user) setDraft({ name: user.name, email: user.email });
    }, [user]);

    const commit = (field: "name" | "email") => {
        if (!user) return;
        const value = draft[field].trim();

        const invalid =
            (field === "name" && !value) ||
            (field === "email" && !/^\S+@\S+\.\S+$/.test(value));

        if (invalid) {
            setDraft((d) => ({ ...d, [field]: user[field] })); // revert
            return;
        }
        if (value !== user[field]) {
            updateUser({ [field]: value }).then((res) => {
                if (!res.ok) setDraft((d) => ({ ...d, [field]: user[field] }));
            });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") e.currentTarget.blur();
    };

    useEffect(() => {
        if (!loading && !user) navigate("/login", { replace: true });
    }, [loading, user, navigate]);

    if (loading || !user) return null;

    return (
        <div>
            <img className="background-logo" src={LogoIcon750px} alt="LogoIcon750px" />
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <NavBrand />
                    <div className="spacer"></div>
                    <h2>{t("nav.user")}</h2>
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
                <div className="user-card">
                    <div className="header-group">
                        <div className="full-brand">
                            <div className="brand">
                                <img src={LogoIcon35px} alt="LogoIcon35px"/>
                            </div>
                            <h1>PhysicsGo</h1>
                        </div>
                    </div>
                    <div className="info">
                        <label className="set-name info-row">
                            <span className="info-label">{t("user.name")}</span>
                            <input
                                className="info-input"
                                type="text"
                                autoComplete="name"
                                value={draft.name}
                                placeholder="Nick Von Hoff"
                                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                                onBlur={() => commit("name")}
                                onKeyDown={handleKeyDown}
                            />
                        </label>
                        <label className="set-email info-row">
                            <span className="info-label">{t("user.email")}</span>
                            <input
                                className="info-input"
                                type="email"
                                autoComplete="email"
                                value={draft.email}
                                placeholder={t("user.emailExample")}
                                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                                onBlur={() => commit("email")}
                                onKeyDown={handleKeyDown}
                            />
                        </label>
                        {/* Class membership is managed through class codes, not edited here */}
                        <div className="set-class info-row">
                            <span className="info-label">{t("user.class")}</span>
                            <span className="info-value">
                                {user.role === "teacher"
                                    ? t("user.roleTeacher")
                                    : user.classes.map((c) => c.name).join(", ") || "—"}
                            </span>
                        </div>
                    </div>
                    <div className="footer-context">
                        <p>PhysicsGo v1.1 · C.H.M. van den Eijnden · J.J. van Wegen</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default User;