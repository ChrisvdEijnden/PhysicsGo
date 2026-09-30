import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import NavBrand from "./NavBrand";
import { useAuth } from "../lib/useAuth";
import { useTranslation } from "../lib/useTranslations";

export interface Crumb {
    label: string;
    // Where the crumb leads; the last crumb (the current page) has none
    to?: string;
}

// The bar at the top of every page: logo, where you are, the page's own actions, and who's signed in
export default function TopBar({ crumbs, after, children }: {
    crumbs: Crumb[];
    // Shown right after the crumbs, e.g. the save status of a project
    after?: ReactNode;
    // The page's own actions, before the user menu
    children?: ReactNode;
}) {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { user } = useAuth();

    return (
        <header className="nav">
            <nav className="brand-and-breadcrumb" aria-label={t("nav.breadcrumbs")}>
                <NavBrand />
                {crumbs.map((c, i) => (
                    <span key={i} className="crumb">
                        <span className="spacer" aria-hidden="true"></span>
                        {c.to
                            ? <button type="button" className="breadcrumb-link" onClick={() => navigate(c.to!)}>{c.label}</button>
                            : <h2 aria-current="page">{c.label}</h2>}
                    </span>
                ))}
                {after}
            </nav>
            <div className="system-actions">
                {children}
                {user ? <UserMenu/> : (
                    <div className="right-system-actions">
                        <button type="button" aria-label={t("nav.settings")} title={t("nav.settings")} onClick={() => navigate("/settings")}>
                            <img src={SettingsIcon21px} alt=""/>
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}

// The signed-in user's name, opening their profile, settings and signing out
function UserMenu() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { user, logout } = useAuth();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onPointer = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        window.addEventListener("pointerdown", onPointer);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("pointerdown", onPointer);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    if (!user) return null;
    const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
    const go = (to: string) => {
        setOpen(false);
        navigate(to);
    };

    return (
        <div className="user-menu" ref={ref}>
            <button type="button" className="user-menu-button" aria-haspopup="menu" aria-expanded={open}
                    onClick={() => setOpen(!open)}>
                <span className="user-avatar" aria-hidden="true">{initials}</span>
                <span className="user-menu-name">{user.name}</span>
            </button>
            {open && (
                <div className="user-menu-popup" role="menu">
                    <div className="user-menu-who">
                        <strong>{user.name}</strong>
                        <span>{user.role === "teacher" ? t("user.roleTeacher") : t("user.roleStudent")} · {user.email}</span>
                    </div>
                    <button type="button" role="menuitem" autoFocus onClick={() => go("/user")}>{t("nav.profile")}</button>
                    <button type="button" role="menuitem" onClick={() => go("/settings")}>{t("nav.settings")}</button>
                    <button type="button" role="menuitem" onClick={async () => {
                        setOpen(false);
                        await logout();
                        navigate("/login", { replace: true });
                    }}>{t("settings.logout")}</button>
                </div>
            )}
        </div>
    );
}
