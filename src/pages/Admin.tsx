import { useCallback, useEffect, useState } from "react";

import "../styles/global.css";
import "./dashboard.css";
import "./classes.css";
import "./admin.css";

import TopBar from "../components/TopBar";
import ConfirmButton from "../components/ConfirmButton";
import EditIcon20px from "../assets/icons/edit-20px.svg";
import { api } from "../lib/api";
import { authErrorKey } from "../lib/authErrors";
import { formatRelativeDate } from "../lib/formatRelativeDate";
import { useAuth } from "../lib/useAuth";
import type { Role } from "../lib/useAuth";
import { useTranslation } from "../lib/useTranslations";

interface School {
    id: number;
    name: string;
    teachers: number;
    students: number;
    classes: number;
    invites: number;
}

interface Invite {
    code: string;
    usesLeft: number;
    createdAt: number | null;
    expiresAt: number | null;
    createdBy: string | null;
    school: string | null;
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
    school: { id: number; name: string } | null;
}

// What went wrong for one account, e.g. a teacher whose classes need another teacher first
type RowError = { error: string; classes?: string[] };

// For administrators: schools, teacher invitations, and every account (school, roles, resets,
// deactivating, deleting)
export default function Admin() {
    const { t } = useTranslation();
    const { refresh } = useAuth();
    const [schools, setSchools] = useState<School[] | null>(null);
    const reloadSchools = useCallback(() => {
        api<{ schools: School[] }>("/admin/schools").then(({ ok, data }) => ok && data.schools && setSchools(data.schools));
    }, []);
    useEffect(reloadSchools, [reloadSchools]);
    // A renamed school: the user menu shows yours
    const schoolsChanged = (list: School[]) => {
        setSchools(list);
        refresh();
    };

    return (
        <div className="page-admin">
            <TopBar crumbs={[{ label: t("nav.admin") }]}/>
            <div className="content-dashboard admin-page">
                <div className="left-panel admin-left">
                    <Schools schools={schools} onChange={schoolsChanged}/>
                    <Invitations schools={schools ?? []} onChange={reloadSchools}/>
                </div>
                <div className="right-panel">
                    <Accounts schools={schools ?? []} onChange={reloadSchools}/>
                </div>
            </div>
        </div>
    );
}

function Schools({ schools, onChange }: { schools: School[] | null; onChange: (schools: School[]) => void }) {
    const { t } = useTranslation();
    const [name, setName] = useState("");
    const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function send(path: string, method: "POST" | "PATCH" | "DELETE", body?: object) {
        setError(null);
        const { ok, data } = await api<{ schools: School[] }>(path, method, body);
        if (!ok || !data.schools) {
            setError(data.error ?? "server_error");
            return false;
        }
        onChange(data.schools);
        return true;
    }

    async function add(e: React.FormEvent) {
        e.preventDefault();
        if (name.trim() && await send("/admin/schools", "POST", { name })) setName("");
    }

    async function rename(e: React.FormEvent) {
        e.preventDefault();
        if (editing && await send(`/admin/schools/${editing.id}`, "PATCH", { name: editing.name })) setEditing(null);
    }

    return (
        <div className="creator-card admin-card">
            <h2>{t("admin.schoolsTitle")}</h2>
            <p className="section-hint">{t("admin.schoolsDesc")}</p>
            <form className="admin-invite-form" onSubmit={add}>
                <label className="publish-field">
                    <span>{t("admin.schoolName")}</span>
                    <input className="class-input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)}/>
                </label>
                <button type="submit" className="class-button primary" disabled={!name.trim()}>{t("admin.addSchool")}</button>
            </form>
            {error && <p className="class-error" role="alert">{t(authErrorKey(error))}</p>}
            <div className="member-list">
                {schools?.length === 0 && <p className="classes-empty">{t("admin.noSchools")}</p>}
                {schools?.map((s) => editing?.id === s.id ? (
                    <form key={s.id} className="member-row" onSubmit={rename}>
                        <input className="class-input" value={editing.name} maxLength={100} autoFocus
                               aria-label={t("admin.renameSchool", { name: s.name })}
                               onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                               onKeyDown={(e) => e.key === "Escape" && setEditing(null)}/>
                        <button type="submit" className="class-button primary" disabled={!editing.name.trim()}>{t("admin.save")}</button>
                        <button type="button" className="class-button" onClick={() => setEditing(null)}>{t("admin.cancel")}</button>
                    </form>
                ) : (
                    <div key={s.id} className="member-row">
                        <div className="member-text">
                            <p className="member-name">{s.name}</p>
                            <p className="member-sub">{t("admin.schoolCounts", { teachers: s.teachers, students: s.students, classes: s.classes })}</p>
                        </div>
                        <button type="button" className="icon-button" aria-label={t("admin.renameSchool", { name: s.name })}
                                title={t("admin.renameSchool", { name: s.name })}
                                onClick={() => { setError(null); setEditing({ id: s.id, name: s.name }); }}>
                            <img src={EditIcon20px} alt=""/>
                        </button>
                        {s.teachers + s.students + s.classes + s.invites === 0 && (
                            <ConfirmButton className="class-button danger" label={t("admin.deleteSchool")}
                                           onConfirm={() => send(`/admin/schools/${s.id}`, "DELETE")}/>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function Invitations({ schools, onChange }: { schools: School[]; onChange: () => void }) {
    const { t, language } = useTranslation();
    const [invites, setInvites] = useState<Invite[] | null>(null);
    const [schoolId, setSchoolId] = useState<number | null>(null);
    const [uses, setUses] = useState(1);
    const [days, setDays] = useState(14);
    const [made, setMade] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Again when schools change, since each invitation shows its school's name
    useEffect(() => {
        api<{ invites: Invite[] }>("/admin/invites").then(({ ok, data }) => ok && data.invites && setInvites(data.invites));
    }, [schools]);

    async function create(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        const { ok, data } = await api<{ code: string; invites: Invite[] }>("/admin/invites", "POST", { uses, days, schoolId: school });
        if (!ok || !data.code) return setError(data.error ?? "server_error");
        setMade(data.code);
        setInvites(data.invites ?? []);
        onChange();
    }

    async function revoke(code: string) {
        const { ok, data } = await api<{ invites: Invite[] }>(`/admin/invites/${code}`, "DELETE");
        if (ok && data.invites) setInvites(data.invites);
        if (made === code) setMade(null);
        onChange();
    }

    // The school chosen, or the only one there is
    const school = schoolId ?? (schools.length === 1 ? schools[0].id : null);

    const date = (ms: number) => new Date(ms).toLocaleDateString(language, { dateStyle: "medium" });

    return (
        <div className="creator-card admin-card">
            <h2>{t("admin.invitesTitle")}</h2>
            <p className="section-hint">{t("admin.invitesDesc")}</p>
            <form className="admin-invite-form" onSubmit={create}>
                <label className="publish-field admin-school-field">
                    <span>{t("admin.school")}</span>
                    <select className="class-input" value={school ?? ""} required
                            onChange={(e) => setSchoolId(Number(e.target.value) || null)}>
                        {school === null && <option value="">–</option>}
                        {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </label>
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
                <button type="submit" className="class-button primary" disabled={school === null}>{t("admin.createInvite")}</button>
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
                                    i.school,
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

function Accounts({ schools, onChange }: { schools: School[]; onChange: () => void }) {
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

    async function change(account: Account, body: Partial<Pick<Account, "role" | "isAdmin" | "disabled">> | { schoolId: number }) {
        const { ok, data } = await api<{ user: Account; classes?: string[] }>(`/admin/users/${account.id}`, "PATCH", body);
        if (!ok || !data.user) return fail(account.id, { error: data.error ?? "", classes: data.classes });
        fail(account.id, null);
        replace(data.user);
        // The schools' counts change with an account's school or role
        if ("schoolId" in body || "role" in body) onChange();
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
        onChange();
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
                                <select className="class-input admin-role" value={a.school?.id ?? ""}
                                        aria-label={t("admin.schoolOf", { name: a.name })}
                                        onChange={(e) => change(a, { schoolId: Number(e.target.value) })}>
                                    {!a.school && <option value="">{t("admin.noSchool")}</option>}
                                    {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
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
