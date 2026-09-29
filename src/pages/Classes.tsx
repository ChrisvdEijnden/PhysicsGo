import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./dashboard.css";
import "./classes.css";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import NavBrand from "../components/NavBrand";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth";
import { api, errorOf } from "../lib/api";
import { authErrorKey } from "../lib/authErrors";

interface ClassSummary {
    id: number;
    name: string;
    code: string;
    joinOpen: boolean;
    studentCount: number;
    teacherCount: number;
}

interface ClassMember {
    id: number;
    name: string;
    email: string;
}

interface ClassDetail {
    id: number;
    name: string;
    code: string;
    joinOpen: boolean;
    createdAt: number;
    students: (ClassMember & { joinedAt: number })[];
    teachers: (ClassMember & { isYou: boolean })[];
}

const formatCode = (code: string) => code.match(/.{1,4}/g)?.join("-") ?? code;

const summarize = (c: ClassDetail): ClassSummary => ({
    id: c.id,
    name: c.name,
    code: c.code,
    joinOpen: c.joinOpen,
    studentCount: c.students.length,
    teacherCount: c.teachers.length,
});

// Two-step button for destructive actions: the first click arms it, the second confirms
function ConfirmButton({ label, onConfirm, className, disabled }: {
    label: string;
    onConfirm: () => void;
    className: string;
    disabled?: boolean;
}) {
    const { t } = useTranslation();
    const [armed, setArmed] = useState(false);

    useEffect(() => {
        if (!armed) return;
        const timer = setTimeout(() => setArmed(false), 4000);
        return () => clearTimeout(timer);
    }, [armed]);

    return (
        <button
            type="button"
            className={`${className}${armed ? " armed" : ""}`}
            disabled={disabled}
            onClick={() => {
                if (!armed) return setArmed(true);
                setArmed(false);
                onConfirm();
            }}
            onBlur={() => setArmed(false)}
        >
            {armed ? t("classes.confirm") : label}
        </button>
    );
}

function Classes() {
    const navigate = useNavigate();
    const { t, language } = useTranslation();
    const { user, loading, refresh } = useAuth();
    const isTeacher = user?.role === "teacher";

    const [classes, setClasses] = useState<ClassSummary[] | null>(null);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<ClassDetail | null>(null);
    const [listError, setListError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [newName, setNewName] = useState("");
    const [nameDraft, setNameDraft] = useState("");
    const [teacherEmail, setTeacherEmail] = useState("");
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);
    const selectedRef = useRef<number | null>(null);
    selectedRef.current = selectedId;

    useEffect(() => {
        if (loading) return;
        if (!user) navigate("/login", { replace: true });
        else if (!isTeacher) navigate("/dashboard", { replace: true });
    }, [loading, user, isTeacher, navigate]);

    const loadList = useCallback(async () => {
        const { ok, data } = await api<{ classes: ClassSummary[] }>("/classes");
        if (!ok || !data.classes) return setListError(errorOf(data));
        setListError(null);
        setClasses(data.classes);
        setSelectedId((id) => (id !== null && data.classes!.some((c) => c.id === id) ? id : data.classes![0]?.id ?? null));
    }, []);

    useEffect(() => {
        if (isTeacher) loadList();
    }, [isTeacher, loadList]);

    const showDetail = useCallback((c: ClassDetail) => {
        setDetail(c);
        setNameDraft(c.name);
        setClasses((list) => list?.map((x) => (x.id === c.id ? summarize(c) : x)) ?? list);
    }, []);

    useEffect(() => {
        setDetail(null);
        setDetailError(null);
        setCopied(false);
        setTeacherEmail("");
        if (selectedId === null) return;
        api<{ class: ClassDetail }>(`/classes/${selectedId}`).then(({ ok, data }) => {
            if (selectedRef.current !== selectedId) return;
            if (ok && data.class) showDetail(data.class);
            else setDetailError(errorOf(data));
        });
    }, [selectedId, showDetail]);

    // Runs a change to the selected class. The server answers with the updated class,
    // or with not_found when another teacher deleted it or removed this teacher meanwhile.
    const mutate = async (path: string, method: string, body?: unknown) => {
        if (!detail || busy) return false;
        setBusy(true);
        setDetailError(null);
        const { ok, data } = await api<{ class: ClassDetail; left: boolean }>(`/classes/${detail.id}${path}`, method, body);
        setBusy(false);

        if (!ok) {
            if (data.error === "not_found") {
                await loadList();
                setListError("not_found");
            } else {
                setDetailError(errorOf(data));
            }
            return false;
        }
        if (data.class) showDetail(data.class);
        return true;
    };

    const leaveOrDelete = async (path: string, method: string) => {
        if (await mutate(path, method)) {
            setSelectedId(null);
            await Promise.all([loadList(), refresh()]);
        }
    };

    const createClass = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        const { ok, data } = await api<{ class: ClassDetail }>("/classes", "POST", { name: newName });
        setBusy(false);
        if (!ok || !data.class) return setListError(errorOf(data));

        const created = data.class;
        setListError(null);
        setNewName("");
        setClasses((list) => [...(list ?? []), summarize(created)]
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
        setSelectedId(created.id);
        refresh();
    };

    const commitName = async () => {
        if (!detail) return;
        const name = nameDraft.trim();
        if (!name || name === detail.name) return setNameDraft(detail.name);
        if (await mutate("", "PATCH", { name })) refresh();
        else setNameDraft(detail.name);
    };

    const copyCode = async () => {
        if (!detail) return;
        try {
            await navigator.clipboard.writeText(formatCode(detail.code));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard can be unavailable; the code stays selectable on screen
        }
    };

    const addTeacher = async (e: React.FormEvent) => {
        e.preventDefault();
        if (await mutate("/teachers", "POST", { email: teacherEmail })) setTeacherEmail("");
    };

    const studentCount = (n: number) =>
        n === 1 ? t("classes.studentOne") : t("classes.studentMany", { count: n });

    if (loading || !isTeacher) return null;

    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <NavBrand />
                    <div className="spacer"></div>
                    <h2 className="breadcrumb-link" onClick={() => navigate("/dashboard")}>{t("nav.dashboard")}</h2>
                    <div className="spacer"></div>
                    <h2>{t("nav.classes")}</h2>
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

            <div className="content-dashboard">
                <div className="left-panel classes-left">
                    <div className="creator-card classes-list-card">
                        <h2>{t("classes.title")}</h2>
                        <form className="new-class-form" onSubmit={createClass}>
                            <input
                                className="class-input"
                                type="text"
                                maxLength={60}
                                required
                                value={newName}
                                placeholder={t("classes.newClassPlaceholder")}
                                onChange={(e) => setNewName(e.target.value)}
                            />
                            <button className="class-button primary" type="submit" disabled={busy || !newName.trim()}>
                                {t("classes.create")}
                            </button>
                        </form>
                        {listError && <p className="auth-error class-error" role="alert">{t(authErrorKey(listError))}</p>}
                        <div className="presets-list">
                            {classes?.length === 0 && <p className="classes-empty">{t("classes.empty")}</p>}
                            {classes?.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    className={`preset-item class-item${c.id === selectedId ? " selected" : ""}`}
                                    aria-current={c.id === selectedId}
                                    onClick={() => setSelectedId(c.id)}
                                >
                                    <div className="preset-item-text">
                                        <h3>{c.name}</h3>
                                        <p>{studentCount(c.studentCount)}</p>
                                    </div>
                                    {!c.joinOpen && <span className="class-badge">{t("classes.closedBadge")}</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="right-panel class-detail">
                    {!detail && (
                        detailError
                            ? <p className="auth-error class-error" role="alert">{t(authErrorKey(detailError))}</p>
                            : classes && classes.length > 0 && <p className="classes-empty">{t("classes.selectPrompt")}</p>
                    )}
                    {detail && (
                        <>
                            <div className="top-row">
                                <input
                                    className="class-name-input"
                                    aria-label={t("classes.name")}
                                    maxLength={60}
                                    value={nameDraft}
                                    onChange={(e) => setNameDraft(e.target.value)}
                                    onBlur={commitName}
                                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                                />
                                <span className="class-meta">{studentCount(detail.students.length)}</span>
                            </div>
                            {detailError && <p className="auth-error class-error" role="alert">{t(authErrorKey(detailError))}</p>}

                            <section className="class-section">
                                <div className="section-heading">
                                    <h3>{t("classes.studentCode")}</h3>
                                    <p>{t("classes.studentCodeDesc")}</p>
                                </div>
                                <div className="code-row">
                                    <span className={`class-code${detail.joinOpen ? "" : " closed"}`}>{formatCode(detail.code)}</span>
                                    <button type="button" className="class-button" onClick={copyCode}>
                                        {copied ? t("classes.copied") : t("classes.copy")}
                                    </button>
                                    <ConfirmButton
                                        className="class-button"
                                        label={t("classes.regenerate")}
                                        disabled={busy}
                                        onConfirm={() => mutate("/code", "POST")}
                                    />
                                </div>
                                <p className="section-hint">{t("classes.regenerateHint")}</p>
                                <div className="setting-row join-row">
                                    <p>{detail.joinOpen ? t("classes.joinOpen") : t("classes.joinClosed")}</p>
                                    <button
                                        type="button"
                                        className="class-switch"
                                        role="switch"
                                        aria-checked={detail.joinOpen}
                                        aria-label={t("classes.toggleJoin")}
                                        disabled={busy}
                                        onClick={() => mutate("", "PATCH", { joinOpen: !detail.joinOpen })}
                                    >
                                        <span className="class-switch-thumb"></span>
                                    </button>
                                </div>
                            </section>

                            <section className="class-section">
                                <div className="section-heading">
                                    <h3>{t("classes.students")}</h3>
                                </div>
                                {detail.students.length === 0
                                    ? <p className="classes-empty">{t("classes.noStudents")}</p>
                                    : (
                                        <div className="member-list">
                                            {detail.students.map((s) => (
                                                <div key={s.id} className="member-row">
                                                    <div className="member-text">
                                                        <p className="member-name">{s.name}</p>
                                                        <p className="member-sub">{s.email}</p>
                                                    </div>
                                                    <p className="member-sub member-date">
                                                        {t("classes.joinedOn", { date: new Date(s.joinedAt).toLocaleDateString(language) })}
                                                    </p>
                                                    <ConfirmButton
                                                        className="class-button danger"
                                                        label={t("classes.remove")}
                                                        disabled={busy}
                                                        onConfirm={() => mutate(`/students/${s.id}`, "DELETE")}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                            </section>

                            <section className="class-section">
                                <div className="section-heading">
                                    <h3>{t("classes.teachers")}</h3>
                                    <p>{t("classes.teachersDesc")}</p>
                                </div>
                                <div className="member-list">
                                    {detail.teachers.map((m) => (
                                        <div key={m.id} className="member-row">
                                            <div className="member-text">
                                                <p className="member-name">
                                                    {m.name}{m.isYou && <span className="member-you"> ({t("classes.you")})</span>}
                                                </p>
                                                <p className="member-sub">{m.email}</p>
                                            </div>
                                            {!m.isYou && (
                                                <ConfirmButton
                                                    className="class-button danger"
                                                    label={t("classes.remove")}
                                                    disabled={busy}
                                                    onConfirm={() => mutate(`/teachers/${m.id}`, "DELETE")}
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <form className="new-class-form" onSubmit={addTeacher}>
                                    <input
                                        className="class-input"
                                        type="email"
                                        required
                                        value={teacherEmail}
                                        placeholder={t("classes.teacherEmailPlaceholder")}
                                        onChange={(e) => setTeacherEmail(e.target.value)}
                                    />
                                    <button className="class-button" type="submit" disabled={busy || !teacherEmail.trim()}>
                                        {t("classes.addTeacher")}
                                    </button>
                                </form>
                            </section>

                            <section className="class-section">
                                <div className="section-heading">
                                    <h3>{t("classes.manage")}</h3>
                                </div>
                                {/* The last teacher can only delete the class, not leave it */}
                                {detail.teachers.length > 1 && <div className="setting-row">
                                    <p className="section-hint">{t("classes.leaveDesc")}</p>
                                    <ConfirmButton
                                        className="class-button danger"
                                        label={t("classes.leave")}
                                        disabled={busy}
                                        onConfirm={() => {
                                            const me = detail.teachers.find((m) => m.isYou);
                                            if (me) leaveOrDelete(`/teachers/${me.id}`, "DELETE");
                                        }}
                                    />
                                </div>}
                                <div className="setting-row">
                                    <p className="section-hint">{t("classes.deleteDesc")}</p>
                                    <ConfirmButton
                                        className="class-button danger"
                                        label={t("classes.delete")}
                                        disabled={busy}
                                        onConfirm={() => leaveOrDelete("", "DELETE")}
                                    />
                                </div>
                            </section>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Classes;
