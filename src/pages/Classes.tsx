import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./dashboard.css";
import "./classes.css";

import NavBrand from "../components/NavBrand";
import NavActions from "../components/NavActions";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth";
import { api, errorOf } from "../lib/api";
import { authErrorKey } from "../lib/authErrors";
import ConfirmButton from "../components/ConfirmButton";
import { useProjects } from "../lib/useProjects";

interface ClassSummary {
    id: number;
    name: string;
    code: string;
    joinOpen: boolean;
    archivedAt: number | null;
    isOwner: boolean;
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
    // Deleted classes are archived until purgeAt, and can be restored until then
    archivedAt: number | null;
    purgeAt: number | null;
    youAreOwner: boolean;
    students: (ClassMember & { joinedAt: number })[];
    teachers: (ClassMember & { isYou: boolean; isOwner: boolean })[];
    // Pending co-teacher invitations, by email address
    invites: { email: string; createdAt: number }[];
}

// Where each student is on a project published to the class
interface ProjectProgress {
    projectId: string;
    students: {
        id: number;
        name: string;
        status: "not_started" | "working" | "handed_in";
        updatedAt: number | null;
        submittedAt: number | null;
        changedSince: boolean;
    }[];
}

// A class another teacher invited this teacher to
interface Invitation {
    id: number;
    name: string;
    invitedAt: number;
    invitedBy: string | null;
}

const formatCode = (code: string) => code.match(/.{1,4}/g)?.join("-") ?? code;

const summarize = (c: ClassDetail): ClassSummary => ({
    id: c.id,
    name: c.name,
    code: c.code,
    joinOpen: c.joinOpen,
    archivedAt: c.archivedAt,
    isOwner: c.youAreOwner,
    studentCount: c.students.length,
    teacherCount: c.teachers.length,
});

function Classes() {
    const navigate = useNavigate();
    const location = useLocation();
    const { t, language } = useTranslation();
    const { user, refresh } = useAuth();
    const { byId } = useProjects();
    const isTeacher = user?.role === "teacher";
    // Coming back from a student's work opens the class it belongs to
    const returnTo = (location.state as { classId?: number } | null)?.classId ?? null;

    const [classes, setClasses] = useState<ClassSummary[] | null>(null);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(returnTo);
    const [progress, setProgress] = useState<ProjectProgress[] | null>(null);
    const [openProject, setOpenProject] = useState<string | null>(null);
    const [detail, setDetail] = useState<ClassDetail | null>(null);
    const [listError, setListError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [newName, setNewName] = useState("");
    const [nameDraft, setNameDraft] = useState("");
    const [teacherEmail, setTeacherEmail] = useState("");
    const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
    // A one-time code a student uses to choose a new password, shown until closed
    const [resetCode, setResetCode] = useState<{ studentId: number; code: string; expiresAt: number } | null>(null);
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);
    const selectedRef = useRef<number | null>(null);
    selectedRef.current = selectedId;

    const loadList = useCallback(async () => {
        const { ok, data } = await api<{ classes: ClassSummary[] }>("/classes");
        if (!ok || !data.classes) return setListError(errorOf(data));
        setListError(null);
        setClasses(data.classes);
        // Keep the selection if it still exists; otherwise start at the first class that isn't deleted
        const first = data.classes.find((c) => c.archivedAt === null) ?? data.classes[0];
        setSelectedId((id) => (id !== null && data.classes!.some((c) => c.id === id) ? id : first?.id ?? null));
    }, []);

    const loadInvitations = useCallback(async () => {
        const { ok, data } = await api<{ invitations: Invitation[] }>("/classes/invitations");
        if (ok && data.invitations) setInvitations(data.invitations);
    }, []);

    useEffect(() => {
        if (!isTeacher) return;
        loadList();
        loadInvitations();
    }, [isTeacher, loadList, loadInvitations]);

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
        setInvitedEmail(null);
        setResetCode(null);
        setProgress(null);
        setOpenProject(null);
        if (selectedId === null) return;
        api<{ projects: ProjectProgress[] }>(`/classes/${selectedId}/progress`).then(({ ok, data }) => {
            if (selectedRef.current === selectedId && ok && data.projects) setProgress(data.projects);
        });
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

    const leave = async () => {
        const me = detail?.teachers.find((m) => m.isYou);
        if (me && await mutate(`/teachers/${me.id}`, "DELETE")) {
            setSelectedId(null);
            await Promise.all([loadList(), refresh()]);
        }
    };

    // Deleting archives the class, and restoring brings it back; both change the account's class list
    const archive = async () => {
        if (await mutate("", "DELETE")) refresh();
    };

    const restore = async () => {
        if (await mutate("/restore", "POST")) refresh();
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

    const inviteTeacher = async (e: React.FormEvent) => {
        e.preventDefault();
        const email = teacherEmail.trim();
        if (await mutate("/teachers", "POST", { email })) {
            setTeacherEmail("");
            setInvitedEmail(email);
        }
    };

    const makeResetCode = async (studentId: number) => {
        if (!detail || busy) return;
        setBusy(true);
        setDetailError(null);
        const { ok, data } = await api<{ code: string; expiresAt: number }>(
            `/classes/${detail.id}/students/${studentId}/reset`, "POST"
        );
        setBusy(false);
        if (ok && data.code && data.expiresAt) setResetCode({ studentId, code: data.code, expiresAt: data.expiresAt });
        else setDetailError(errorOf(data));
    };

    const answerInvitation = async (classId: number, answer: "accept" | "decline") => {
        if (busy) return;
        setBusy(true);
        const { ok, data } = await api<{ invitations: Invitation[] }>(`/classes/invitations/${classId}/${answer}`, "POST");
        setBusy(false);
        if (!ok || !data.invitations) {
            setListError(errorOf(data));
            return loadInvitations();
        }
        setListError(null);
        setInvitations(data.invitations);
        if (answer === "accept") {
            await Promise.all([loadList(), refresh()]);
            setSelectedId(classId);
        }
    };

    const studentCount = (n: number) =>
        n === 1 ? t("classes.studentOne") : t("classes.studentMany", { count: n });
    const formatDate = (ms: number) => new Date(ms).toLocaleDateString(language);


    const activeClasses = classes?.filter((c) => c.archivedAt === null) ?? [];
    const archivedClasses = classes?.filter((c) => c.archivedAt !== null) ?? [];
    const archived = detail?.archivedAt != null;
    const classItem = (c: ClassSummary) => (
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
            {c.archivedAt !== null
                ? <span className="class-badge">{t("classes.archivedBadge")}</span>
                : !c.joinOpen && <span className="class-badge">{t("classes.closedBadge")}</span>}
        </button>
    );

    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <NavBrand />
                    <div className="spacer"></div>
                    <h2><Link className="breadcrumb-link" to="/dashboard">{t("nav.dashboard")}</Link></h2>
                    <div className="spacer"></div>
                    <h2>{t("nav.classes")}</h2>
                </div>
                <NavActions/>
            </div>

            <div className="content-dashboard">
                <div className="left-panel classes-left">
                    {invitations.length > 0 && (
                        <div className="creator-card invitations-card">
                            <h2>{t("classes.invitationsTitle")}</h2>
                            <div className="member-list">
                                {invitations.map((inv) => (
                                    <div key={inv.id} className="member-row">
                                        <div className="member-text">
                                            <p className="member-name">{inv.name}</p>
                                            <p className="member-sub">
                                                {inv.invitedBy ? t("classes.invitedBy", { name: inv.invitedBy }) : formatDate(inv.invitedAt)}
                                            </p>
                                        </div>
                                        <button type="button" className="class-button" disabled={busy}
                                                onClick={() => answerInvitation(inv.id, "decline")}>
                                            {t("classes.decline")}
                                        </button>
                                        <button type="button" className="class-button primary" disabled={busy}
                                                onClick={() => answerInvitation(inv.id, "accept")}>
                                            {t("classes.accept")}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
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
                            {classes && activeClasses.length === 0 && <p className="classes-empty">{t("classes.empty")}</p>}
                            {activeClasses.map(classItem)}
                        </div>
                        {archivedClasses.length > 0 && (
                            <>
                                <h3 className="archived-heading">{t("classes.archivedTitle")}</h3>
                                <div className="presets-list">{archivedClasses.map(classItem)}</div>
                            </>
                        )}
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
                                {archived
                                    ? <h2 className="class-name-static">{detail.name}</h2>
                                    : <input
                                        className="class-name-input"
                                        aria-label={t("classes.name")}
                                        maxLength={60}
                                        value={nameDraft}
                                        onChange={(e) => setNameDraft(e.target.value)}
                                        onBlur={commitName}
                                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                                    />}
                                <span className="class-meta">{studentCount(detail.students.length)}</span>
                            </div>
                            {detailError && <p className="auth-error class-error" role="alert">{t(authErrorKey(detailError))}</p>}

                            {archived && (
                                <section className="class-section archived-notice">
                                    <p>{t("classes.archivedNotice", {
                                        date: formatDate(detail.archivedAt!),
                                        purge: formatDate(detail.purgeAt!),
                                    })}</p>
                                    {detail.youAreOwner
                                        ? (
                                            <button type="button" className="class-button primary" disabled={busy} onClick={restore}>
                                                {t("classes.restore")}
                                            </button>
                                        )
                                        : <p className="section-hint">{t("classes.restoreOwnerOnly")}</p>}
                                </section>
                            )}

                            {!archived && (
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
                            )}

                            {(!archived || detail.students.length > 0) && <section className="class-section">
                                <div className="section-heading">
                                    <h3>{t("classes.students")}</h3>
                                </div>
                                {detail.students.length === 0
                                    ? <p className="classes-empty">{t("classes.noStudents")}</p>
                                    : (
                                        <div className="member-list">
                                            {detail.students.map((s) => (
                                                <Fragment key={s.id}>
                                                    <div className="member-row">
                                                        <div className="member-text">
                                                            <p className="member-name">{s.name}</p>
                                                            <p className="member-sub">{s.email}</p>
                                                        </div>
                                                        <p className="member-sub member-date">
                                                            {t("classes.joinedOn", { date: formatDate(s.joinedAt) })}
                                                        </p>
                                                        {!archived && (
                                                            <>
                                                                <button type="button" className="class-button" disabled={busy}
                                                                        onClick={() => makeResetCode(s.id)}>
                                                                    {t("classes.resetPassword")}
                                                                </button>
                                                                <ConfirmButton
                                                                    className="class-button danger"
                                                                    label={t("classes.remove")}
                                                                    disabled={busy}
                                                                    onConfirm={() => mutate(`/students/${s.id}`, "DELETE")}
                                                                />
                                                            </>
                                                        )}
                                                    </div>
                                                    {resetCode?.studentId === s.id && (
                                                        <div className="reset-code-panel" role="status">
                                                            <div className="reset-code-text">
                                                                <p className="member-name">{t("classes.resetCodeFor", { name: s.name })}</p>
                                                                <span className="class-code">{resetCode.code}</span>
                                                                <p className="section-hint">{t("classes.resetCodeHint", {
                                                                    name: s.name,
                                                                    time: new Date(resetCode.expiresAt).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" }),
                                                                })}</p>
                                                            </div>
                                                            <button type="button" className="class-button" onClick={() => setResetCode(null)}>
                                                                {t("classes.close")}
                                                            </button>
                                                        </div>
                                                    )}
                                                </Fragment>
                                            ))}
                                        </div>
                                    )}
                            </section>}

                            {!archived && progress && (
                                <section className="class-section">
                                    <div className="section-heading">
                                        <h3>{t("classes.assignments")}</h3>
                                        <p>{t("classes.assignmentsDesc")}</p>
                                    </div>
                                    {progress.length === 0 && <p className="classes-empty">{t("classes.noAssignments")}</p>}
                                    {progress.map((p) => {
                                        const count = (status: string) => p.students.filter((s) => s.status === status).length;
                                        const expanded = openProject === p.projectId;
                                        return (
                                            <div key={p.projectId} className="assignment">
                                                <div className="member-row">
                                                    <div className="member-text">
                                                        <p className="member-name">
                                                            {byId(p.projectId)?.title ?? p.projectId}
                                                        </p>
                                                        <p className="member-sub">{t("classes.progressSummary", {
                                                            handedIn: count("handed_in"),
                                                            working: count("working"),
                                                            notStarted: count("not_started"),
                                                        })}</p>
                                                    </div>
                                                    {p.students.length > 0 && (
                                                        <button type="button" className="class-button" aria-expanded={expanded}
                                                                onClick={() => setOpenProject(expanded ? null : p.projectId)}>
                                                            {expanded ? t("classes.hideStudents") : t("classes.showStudents")}
                                                        </button>
                                                    )}
                                                </div>
                                                {expanded && (
                                                    <div className="member-list assignment-students">
                                                        {p.students.map((s) => (
                                                            <div key={s.id} className="member-row">
                                                                <div className="member-text">
                                                                    <p className="member-name">{s.name}</p>
                                                                    <p className="member-sub">
                                                                        {s.submittedAt !== null
                                                                            ? `${formatDate(s.submittedAt)}${s.changedSince ? ` · ${t("classes.changedSince")}` : ""}`
                                                                            : s.updatedAt !== null ? formatDate(s.updatedAt) : "—"}
                                                                    </p>
                                                                </div>
                                                                <span className={`class-badge status-${s.status}`}>
                                                                    {s.status === "handed_in" ? t("classes.statusHandedIn")
                                                                        : s.status === "working" ? t("classes.statusWorking")
                                                                        : t("classes.statusNotStarted")}
                                                                </span>
                                                                <button type="button" className="class-button" disabled={s.status === "not_started"}
                                                                        onClick={() => navigate(`/review/${detail.id}/${s.id}/${p.projectId}`)}>
                                                                    {t("classes.view")}
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </section>
                            )}

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
                                            {m.isOwner && <span className="class-badge">{t("classes.owner")}</span>}
                                            {/* Only the owner hands the class over or removes other teachers */}
                                            {detail.youAreOwner && !archived && !m.isYou && (
                                                <>
                                                    <ConfirmButton
                                                        className="class-button"
                                                        label={t("classes.makeOwner")}
                                                        disabled={busy}
                                                        onConfirm={() => mutate("/owner", "POST", { userId: m.id })}
                                                    />
                                                    <ConfirmButton
                                                        className="class-button danger"
                                                        label={t("classes.remove")}
                                                        disabled={busy}
                                                        onConfirm={() => mutate(`/teachers/${m.id}`, "DELETE")}
                                                    />
                                                </>
                                            )}
                                        </div>
                                    ))}
                                    {detail.invites.map((inv) => (
                                        <div key={inv.email} className="member-row">
                                            <div className="member-text">
                                                <p className="member-name">{inv.email}</p>
                                                <p className="member-sub">{t("classes.invitedOn", { date: formatDate(inv.createdAt) })}</p>
                                            </div>
                                            <span className="class-badge">{t("classes.pendingInvite")}</span>
                                            {!archived && (
                                                <button
                                                    type="button"
                                                    className="class-button"
                                                    disabled={busy}
                                                    onClick={() => mutate(`/invites/${encodeURIComponent(inv.email)}`, "DELETE")}
                                                >
                                                    {t("classes.cancelInvite")}
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {!archived && (
                                    <form className="new-class-form" onSubmit={inviteTeacher}>
                                        <input
                                            className="class-input"
                                            type="email"
                                            required
                                            value={teacherEmail}
                                            placeholder={t("classes.teacherEmailPlaceholder")}
                                            onChange={(e) => {
                                                setTeacherEmail(e.target.value);
                                                setInvitedEmail(null);
                                            }}
                                        />
                                        <button className="class-button" type="submit" disabled={busy || !teacherEmail.trim()}>
                                            {t("classes.addTeacher")}
                                        </button>
                                    </form>
                                )}
                                {invitedEmail && (
                                    <p className="section-hint" role="status">{t("classes.inviteSent", { email: invitedEmail })}</p>
                                )}
                            </section>

                            {(!detail.youAreOwner || !archived) && <section className="class-section">
                                <div className="section-heading">
                                    <h3>{t("classes.manage")}</h3>
                                </div>
                                {/* The owner hands the class over before leaving; co-teachers can always leave */}
                                {!detail.youAreOwner && (
                                    <div className="setting-row">
                                        <p className="section-hint">{t("classes.leaveDesc")}</p>
                                        <ConfirmButton
                                            className="class-button danger"
                                            label={t("classes.leave")}
                                            disabled={busy}
                                            onConfirm={leave}
                                        />
                                    </div>
                                )}
                                {detail.youAreOwner && !archived && (
                                    <>
                                        {detail.teachers.length > 1 && <p className="section-hint">{t("classes.ownerLeaveHint")}</p>}
                                        <div className="setting-row">
                                            <p className="section-hint">{t("classes.deleteDesc")}</p>
                                            <ConfirmButton
                                                className="class-button danger"
                                                label={t("classes.delete")}
                                                disabled={busy}
                                                onConfirm={archive}
                                            />
                                        </div>
                                    </>
                                )}
                            </section>}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Classes;
