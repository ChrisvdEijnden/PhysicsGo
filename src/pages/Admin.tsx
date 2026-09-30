import { useCallback, useEffect, useState } from "react";

import "../styles/global.css";
import "./dashboard.css";
import "./classes.css";
import "./admin.css";

import TopBar from "../components/TopBar";
import ConfirmButton from "../components/ConfirmButton";
import { api } from "../lib/api";
import { authErrorKey } from "../lib/authErrors";
import { formatRelativeDate } from "../lib/formatRelativeDate";
import { useAuth } from "../lib/useAuth";
import type { Role } from "../lib/useAuth";
import { useTranslation } from "../lib/useTranslations";

interface Invite {
    code: string;
    usesLeft: number;
    createdAt: number | null;
    expiresAt: number | null;
    createdBy: string | null;
}

interface Account {
    id: number;
    name: string;
    email: string;
    role: Role;
    isAdmin: boolean;
    disabled: boolean;
    createdAt: number;
    lastActiveAt: number | null;
    classes: number;
}

// What went wrong for one account, e.g. a teacher whose classes need another teacher first
type RowError = { error: string; classes?: string[] };

// For administrators: teacher invitations, and every account (roles, resets, deactivating, deleting)
export default function Admin() {
    const { t } = useTranslation();
    return (
        <div>
            <TopBar crumbs={[{ label: t("nav.admin") }]}/>
            <div className="content-dashboard admin-page">
                <div className="left-panel admin-left">
                    <Invitations/>
                </div>
                <div className="right-panel">
                    <Accounts/>
                </div>
            </div>
        </div>
    );
}

function Invitations() {
    const { t, language } = useTranslation();
    const [invites, setInvites] = useState<Invite[] | null>(null);
    const [uses, setUses] = useState(1);
    const [days, setDays] = useState(14);
    const [made, setMade] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api<{ invites: Invite[] }>("/admin/invites").then(({ ok, data }) => ok && data.invites && setInvites(data.invites));
    }, []);

    async function create(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        const { ok, data } = await api<{ code: string; invites: Invite[] }>("/admin/invites", "POST", { uses, days });
        if (!ok || !data.code) return setError(data.error ?? "server_error");
        setMade(data.code);
        setInvites(data.invites ?? []);
    }

    async function revoke(code: string) {
        const { ok, data } = await api<{ invites: Invite[] }>(`/admin/invites/${code}`, "DELETE");
        if (ok && data.invites) setInvites(data.invites);
        if (made === code) setMade(null);
    }

    const date = (ms: number) => new Date(ms).toLocaleDateString(language, { dateStyle: "medium" });

    return (
        <div className="creator-card admin-card">
            <h2>{t("admin.invitesTitle")}</h2>
            <p className="section-hint">{t("admin.invitesDesc")}</p>
            <form className="admin-invite-form" onSubmit={create}>
                <label className="publish-field">
                    <span>{t("admin.inviteUses")}</span>
                    <input type="number" className="class-input" min={1} max={100} value={uses}
                           onChange={(e) => setUses(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}/>
                </label>
                <label className="publish-field">
                    <span>{t("admin.inviteValid")}</span>
                    <select className="class-input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                        {[7, 14, 30, 90].map((d) => <option key={d} value={d}>{t("admin.days", { n: d })}</option>)}
                    </select>
                </label>
                <button type="submit" className="class-button primary">{t("admin.createInvite")}</button>
            </form>
            {error && <p className="class-error" role="alert">{t(authErrorKey(error))}</p>}
            {made && (
                <div className="admin-new-code" role="status">
                    <p>{t("admin.inviteMade")}</p>
                    <span className="class-code">{made}</span>
                </div>
            )}
            <div className="member-list">
                {invites?.length === 0 && <p className="classes-empty">{t("admin.noInvites")}</p>}
                {invites?.map((i) => (
                    <div key={i.code} className="member-row">
                        <div className="member-text">
                            <p className="member-name admin-code">{i.code}</p>
                            <p className="member-sub">
                                {[
                                    t("admin.usesLeft", { n: i.usesLeft }),
                                    i.expiresAt !== null ? t("admin.validUntil", { date: date(i.expiresAt) }) : t("admin.noExpiry"),
                                    i.createdBy,
                                ].filter(Boolean).join(" · ")}
                            </p>
                        </div>
                        <ConfirmButton className="class-button danger" label={t("admin.revoke")} onConfirm={() => revoke(i.code)}/>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Accounts() {
    const { t, language } = useTranslation();
    const { user: me } = useAuth();
    const [query, setQuery] = useState("");
    const [accounts, setAccounts] = useState<Account[] | null>(null);
    const [more, setMore] = useState(false);
    const [errors, setErrors] = useState<Record<number, RowError>>({});
    const [resets, setResets] = useState<Record<number, { code: string; expiresAt: number }>>({});

    const load = useCallback(async (q: string) => {
        const { ok, data } = await api<{ users: Account[]; more: boolean }>(`/admin/users?q=${encodeURIComponent(q)}`);
        if (ok && data.users) {
            setAccounts(data.users);
            setMore(Boolean(data.more));
        }
    }, []);

    // Searches as you type, once typing pauses
    useEffect(() => {
        const timer = setTimeout(() => load(query), 250);
        return () => clearTimeout(timer);
    }, [query, load]);

    const replace = (account: Account) => setAccounts((list) => list?.map((a) => (a.id === account.id ? account : a)) ?? null);
    const fail = (id: number, error: RowError | null) => setErrors((all) => {
        const next = { ...all };
        if (error) next[id] = error;
        else delete next[id];
        return next;
    });

    async function change(account: Account, body: Partial<Pick<Account, "role" | "isAdmin" | "disabled">>) {
        const { ok, data } = await api<{ user: Account; classes?: string[] }>(`/admin/users/${account.id}`, "PATCH", body);
        if (!ok || !data.user) return fail(account.id, { error: data.error ?? "", classes: data.classes });
        fail(account.id, null);
        replace(data.user);
    }

    async function reset(account: Account) {
        const { ok, data } = await api<{ code: string; expiresAt: number }>(`/admin/users/${account.id}/reset`, "POST");
        const { code, expiresAt } = data;
        if (ok && code && expiresAt) setResets((all) => ({ ...all, [account.id]: { code, expiresAt } }));
    }

    async function remove(account: Account) {
        const { ok, data } = await api<{ classes?: string[] }>(`/admin/users/${account.id}`, "DELETE");
        if (!ok) return fail(account.id, { error: data.error ?? "", classes: data.classes });
        setAccounts((list) => list?.filter((a) => a.id !== account.id) ?? null);
    }

    const errorText = (e: RowError) => e.error === "classes_need_teacher"
        ? t("admin.needsTeacher", { classes: (e.classes ?? []).join(", ") })
        : t(authErrorKey(e.error));

    return (
        <div className="admin-accounts">
            <div className="top-row">
                <h2>{t("admin.accountsTitle")}</h2>
            </div>
            <input type="search" className="class-input admin-search" value={query} placeholder={t("admin.search")}
                   aria-label={t("admin.search")} onChange={(e) => setQuery(e.target.value)}/>
            <div className="member-list">
                {accounts?.length === 0 && <p className="classes-empty">{t("admin.noAccounts")}</p>}
                {accounts?.map((a) => {
                    const self = a.id === me?.id;
                    return (
                        <div key={a.id} className={`admin-account${a.disabled ? " disabled" : ""}`}>
                            <div className="member-row">
                                <div className="member-text">
                                    <p className="member-name">
                                        {a.name}{self && <span className="member-you"> ({t("admin.you")})</span>}
                                    </p>
                                    <p className="member-sub">{a.email}</p>
                                    <p className="member-sub">
                                        {[
                                            a.lastActiveAt !== null
                                                ? t("admin.lastActive", { time: formatRelativeDate(new Date(a.lastActiveAt), language) })
                                                : t("admin.neverActive"),
                                            t("admin.classCount", { n: a.classes }),
                                            a.disabled && t("admin.deactivated"),
                                        ].filter(Boolean).join(" · ")}
                                    </p>
                                </div>
                                <select className="class-input admin-role" value={a.role} disabled={self}
                                        aria-label={t("admin.role", { name: a.name })}
                                        onChange={(e) => change(a, { role: e.target.value as Role })}>
                                    <option value="student">{t("user.roleStudent")}</option>
                                    <option value="teacher">{t("user.roleTeacher")}</option>
                                </select>
                                <label className="admin-flag">
                                    <input type="checkbox" checked={a.isAdmin} disabled={self}
                                           onChange={(e) => change(a, { isAdmin: e.target.checked })}/>
                                    {t("admin.administrator")}
                                </label>
                            </div>
                            <div className="admin-actions">
                                <button type="button" className="class-button" onClick={() => reset(a)}>{t("classes.resetPassword")}</button>
                                {!self && (
                                    <button type="button" className="class-button" onClick={() => change(a, { disabled: !a.disabled })}>
                                        {a.disabled ? t("admin.reactivate") : t("admin.deactivate")}
                                    </button>
                                )}
                                {!self && (
                                    <ConfirmButton className="class-button danger" label={t("admin.delete")} onConfirm={() => remove(a)}/>
                                )}
                            </div>
                            {resets[a.id] && (
                                <p className="section-hint" role="status">
                                    {t("admin.resetCode", {
                                        code: resets[a.id].code,
                                        time: new Date(resets[a.id].expiresAt).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" }),
                                    })}
                                </p>
                            )}
                            {errors[a.id] && <p className="class-error" role="alert">{errorText(errors[a.id])}</p>}
                        </div>
                    );
                })}
                {more && <p className="section-hint">{t("admin.more")}</p>}
            </div>
        </div>
    );
}
