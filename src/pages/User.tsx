import "../styles/global.css";
import "./login.css";

import TopBar from "../components/TopBar";
import Credits from "../components/Credits";
import {useTranslation} from "../lib/useTranslations.ts";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth";
import { authErrorKey } from "../lib/authErrors";
import LogoIcon750px from "../assets/icons/logo-750px.svg";
import LogoIcon35px from "../assets/icons/logo-35px.svg";

function User() {
    const { t } = useTranslation();
    const [draft, setDraft] = useState({ name: "", email: "" });
    const [password, setPassword] = useState("");
    const [emailError, setEmailError] = useState<string | null>(null);
    const [nameError, setNameError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const { user, updateUser } = useAuth();

    useEffect(() => {
        if (user) setDraft({ name: user.name, email: user.email });
    }, [user]);

    // The name saves when the field is left; a new email waits for the password (below). A name that
    // couldn't be saved stays in the field with the reason, so leaving it again tries again.
    const commitName = () => {
        if (!user) return;
        const value = draft.name.trim();
        if (!value) {
            setDraft((d) => ({ ...d, name: user.name })); // revert
            setNameError(null);
            return;
        }
        if (value !== user.name) {
            updateUser({ name: value }).then((res) => setNameError(res.ok ? null : res.error));
        } else {
            setNameError(null);
        }
    };

    const emailChanged = !!user && draft.email.trim().toLowerCase() !== user.email;

    const saveEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !emailChanged || saving) return;
        const email = draft.email.trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) return setEmailError("invalid_email");

        setSaving(true);
        setEmailError(null);
        const res = await updateUser({ email, currentPassword: password });
        setSaving(false);
        if (res.ok) setPassword("");
        else setEmailError(res.error);
    };

    const cancelEmail = () => {
        if (!user) return;
        setDraft((d) => ({ ...d, email: user.email }));
        setPassword("");
        setEmailError(null);
    };

    // Enter confirms a field without submitting the form
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
        }
    };

    if (!user) return null;

    return (
        <div className="page-auth">
            <img className="background-logo" src={LogoIcon750px} alt="" />
            <TopBar title={t("nav.user")}/>

            <div className="content">
                <div className="user-card">
                    <div className="header-group">
                        <div className="full-brand">
                            <div className="brand">
                                <img src={LogoIcon35px} alt=""/>
                            </div>
                            <h1>PhysicsGo</h1>
                        </div>
                    </div>
                    <form className="info" onSubmit={saveEmail}>
                        <label className="set-name info-row">
                            <span className="info-label">{t("user.name")}</span>
                            <input
                                className="info-input"
                                type="text"
                                autoComplete="name"
                                value={draft.name}
                                placeholder={t("user.namePlaceholder")}
                                aria-invalid={nameError !== null}
                                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                                onBlur={commitName}
                                onKeyDown={handleKeyDown}
                            />
                        </label>
                        {nameError && <p className="auth-error" role="alert">{t("user.nameNotSaved", { reason: t(authErrorKey(nameError)) })}</p>}
                        <label className="set-email info-row">
                            <span className="info-label">{t("user.email")}</span>
                            <input
                                className="info-input"
                                type="email"
                                autoComplete="email"
                                value={draft.email}
                                placeholder={t("user.emailExample")}
                                onChange={(e) => {
                                    setDraft({ ...draft, email: e.target.value });
                                    setEmailError(null);
                                }}
                            />
                        </label>
                        {emailChanged && (
                            <>
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
                                <p className="info-hint">{t("user.emailChangeHint")}</p>
                                {emailError && <p className="auth-error" role="alert">{t(authErrorKey(emailError))}</p>}
                                <div className="info-actions">
                                    <button className="auth-link" type="button" onClick={cancelEmail}>
                                        {t("user.cancel")}
                                    </button>
                                    <button className="auth-button" type="submit" disabled={saving || !password}>
                                        {t("user.saveEmail")}
                                    </button>
                                </div>
                            </>
                        )}
                        {/* Role, school and classes are managed elsewhere (class codes, Classes, Administration), not edited here */}
                        <div className="info-row">
                            <span className="info-label">{t("user.role")}</span>
                            <span className="info-value">
                                {t(user.role === "teacher" ? "user.roleTeacher" : "user.roleStudent")}
                                {user.isAdmin && ` · ${t("user.roleAdmin")}`}
                            </span>
                        </div>
                        {user.school && (
                            <div className="info-row">
                                <span className="info-label">{t("user.school")}</span>
                                <span className="info-value">{user.school.name}</span>
                            </div>
                        )}
                        <div className="set-class info-row">
                            <span className="info-label">
                                {t(user.role === "student" && user.classes.length === 1 ? "user.class" : "user.classes")}
                            </span>
                            <span className="info-value">
                                {user.classes.map((c) => c.name).join(", ") || t("user.noClasses")}
                            </span>
                        </div>
                    </form>
                    <Credits/>
                </div>
            </div>
        </div>
    )
}

export default User;