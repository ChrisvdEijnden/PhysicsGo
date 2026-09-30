import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../lib/useAuth";
import { useTranslation } from "../lib/useTranslations";

// "Chris van den Eijnden" → "CE"
function initials(name: string) {
    const words = name.trim().split(/\s+/).filter((w) => /^\p{Lu}/u.test(w));
    const picked = words.length >= 2 ? [words[0], words[words.length - 1]] : [name.trim()];
    return picked.map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

// Who is signed in (on shared school computers that matters), with profile, settings and sign out
export default function UserMenu() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            setOpen(false);
            buttonRef.current?.focus();
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    if (!user) return null;

    const go = (path: string) => {
        setOpen(false);
        navigate(path);
    };
    const signOut = async () => {
        setOpen(false);
        await logout();
        navigate("/login", { replace: true });
    };

    return (
        <div className="user-menu" ref={rootRef}>
            <button
                ref={buttonRef}
                type="button"
                className="user-menu-button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={t("nav.userMenu", { name: user.name })}
                title={user.name}
                onClick={() => setOpen(!open)}
            >
                <span className="user-avatar" aria-hidden="true">{initials(user.name)}</span>
                <span className="user-menu-name">{user.name}</span>
            </button>
            {open && (
                <div className="user-menu-items" role="menu">
                    <div className="user-menu-who">
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                        <span className="class-chip">{user.role === "teacher" ? t("user.roleTeacher") : t("user.roleStudent")}</span>
                    </div>
                    <button type="button" role="menuitem" autoFocus onClick={() => go("/user")}>{t("nav.user")}</button>
                    <button type="button" role="menuitem" onClick={() => go("/settings")}>{t("nav.settings")}</button>
                    {user.isAdmin && (
                        <button type="button" role="menuitem" onClick={() => go("/admin")}>{t("nav.admin")}</button>
                    )}
                    <button type="button" role="menuitem" className="sign-out" onClick={signOut}>{t("settings.logout")}</button>
                </div>
            )}
        </div>
    );
}
