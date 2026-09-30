import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./dashboard.css";
import "./classes.css";

import TopBar from "../components/TopBar";
import FolderOpen24px from "../assets/icons/folderopen-24px.svg";
import NewFile24px from "../assets/icons/newfile-24px.svg";
import AscewArrow67px from "../assets/icons/ascewarrow-67px.svg";
import FileCode18px from "../assets/icons/filecode-18px.svg";

// holds all the projects edited by the user
import { assignmentPath, useProjects } from "../lib/useProjects";
import type { ProjectFields } from "../lib/useProjects";
import type { Project, ProjectWork } from "../data/Projects";
import { parseAssignmentFile } from "../lib/assignmentFile";
import { api } from "../lib/api";
import { authErrorKey } from "../lib/authErrors";
import { useWorkActivity } from "../lib/useWorkActivity";
import { formatRelativeDate } from "../lib/formatRelativeDate";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth";
import { canSeeProject, dueDate, usePublished } from "../lib/usePublished";
import { formatDueDate, formatDueDay } from "../lib/formatDueDate";
import ProjectClasses from "../components/ProjectClasses";
import PublishButton from "../components/PublishButton";

function Dashboard() {
    const navigate = useNavigate();
    const { t, language } = useTranslation();
    const { user } = useAuth();
    const isTeacher = user?.role === "teacher";
    const { published, loaded: publishedLoaded, setProjectClasses } = usePublished();
    const { lastEdit, byLastEdit, handedIn, submittedAt } = useWorkActivity();
    const handIns = useRecentHandIns(isTeacher);
    const { projects, createProject } = useProjects();
    const [busy, setBusy] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement | null>(null);

    // A new assignment with the given contents (the author's own; students' are only theirs), then open it
    async function start(fields: Omit<ProjectFields, "estimatedTime" | "equipment">, work?: ProjectWork) {
        setBusy(true);
        setStartError(null);
        const res = await createProject({ ...fields, estimatedTime: null, equipment: [] });
        if (res.ok && work) await api(`/work/${res.project.id}`, "PUT", { work, version: 0 });
        setBusy(false);
        if (!res.ok) return setStartError(res.error);
        navigate(assignmentPath(res.project.id));
    }

    // Teachers write a new assignment in the editor; students get an empty one of their own
    function startEmpty() {
        if (isTeacher) return navigate("/projects/new");
        start({ title: t("dashboard.untitledAssignment"), explanation: "", start: null, model: null });
    }

    // An assignment exported from PhysicsGo becomes a new one with that code, graphs and points
    async function openFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = ""; // the same file can be picked again
        if (!file) return;
        const opened = parseAssignmentFile(await file.text());
        if (!opened) return setStartError("invalid_assignment_file");
        start({
            title: opened.title ?? file.name.replace(/(\.physicsgo)?\.json$/i, "").slice(0, 100),
            explanation: opened.explanation,
            start: opened.work.start,
            model: opened.work.model,
        }, opened.work);
    }

    const visibleProjects = (projects ?? []).filter((project) => canSeeProject(user, published, project));
    const titleOf = (projectId: string) => projects?.find((p) => p.id === projectId)?.title ?? projectId;
    const due = (project: Project) => dueDate(published[project.id]);
    const late = (project: Project) => {
        const at = submittedAt(project);
        return at !== null && due(project) !== null && at > due(project)!;
    };

    // Students: what's assigned to them and not handed in yet, soonest due first (no due date last)
    const todo = visibleProjects
        .filter((project) => (published[project.id]?.length ?? 0) > 0 && !handedIn(project))
        .sort((a, b) => (due(a) ?? Infinity) - (due(b) ?? Infinity) || a.title.localeCompare(b.title));
    // Students: what they've worked on (or started themselves), most recent first
    const recent = visibleProjects.filter((project) => lastEdit(project) !== null || project.mine).sort(byLastEdit);
    // Teachers: the whole library, most recently worked on first
    const rows = isTeacher ? [...visibleProjects].sort(byLastEdit) : recent;

    return (
        <div>
            <TopBar crumbs={[{ label: t("nav.dashboard") }]}/>

            <div className="content-dashboard">
                <div className="left-panel">
                    {!isTeacher && user && (
                        <div className="curriculum-card">
                            <h2>{t("dashboard.todo")}</h2>
                            {!publishedLoaded || projects === null ? null : todo.length === 0 ? (
                                <p className="classes-empty">
                                    {user.classes.length === 0 ? t("dashboard.todoNoClass")
                                        : Object.keys(published).length === 0 ? t("dashboard.todoNothingShared")
                                        : t("dashboard.todoAllDone")}
                                </p>
                            ) : (
                                <div className="presets-list">
                                    {todo.map((project) => {
                                        const dueAt = due(project);
                                        const overdue = dueAt !== null && dueAt < Date.now();
                                        return (
                                            <div key={project.id} className="preset-item">
                                                <div className="preset-item-text">
                                                    <h3><Link className="row-link" to={assignmentPath(project.id)}>{project.title}</Link></h3>
                                                    <p className={`due-label${overdue ? " overdue" : ""}`}>
                                                        {dueAt === null ? t("dashboard.noDueDate")
                                                            : t(overdue ? "dashboard.overdue" : "dashboard.due", { time: formatDueDate(dueAt, language) })}
                                                    </p>
                                                </div>
                                                <span className={`class-chip${lastEdit(project) ? "" : " muted"}`}>
                                                    {lastEdit(project) ? t("classes.statusWorking") : t("classes.statusNotStarted")}
                                                </span>
                                                <img src={AscewArrow67px} alt=""/>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                    <div className="creator-card">
                        <h2>{t("dashboard.startNewModel")}</h2>
                        <div className="dual-action-buttons">
                            {/* Teachers write a new assignment for their classes; students start one of their own */}
                            <button type="button" className="action-new" disabled={busy} onClick={startEmpty}>
                                <img src={NewFile24px} alt=""/>
                                <span className="action-text">
                                    <span className="action-title">{t("dashboard.emptyProjectTitle")}</span>
                                    <span className="action-description">{t("dashboard.emptyProjectDesc")}</span>
                                </span>
                            </button>
                            <button type="button" className="action-open" disabled={busy} onClick={() => fileInput.current?.click()}>
                                <img src={FolderOpen24px} alt=""/>
                                <span className="action-text">
                                    <span className="action-title">{t("dashboard.openProjectTitle")}</span>
                                    <span className="action-description">{t("dashboard.openProjectDesc")}</span>
                                </span>
                            </button>
                            <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={openFile}/>
                        </div>
                        {startError && <p className="class-error" role="alert">{t(authErrorKey(startError))}</p>}
                    </div>
                    {user && (
                        <div className="curriculum-card">
                            <h2>{isTeacher ? t("dashboard.manageClassesTitle") : t("dashboard.yourClasses")}</h2>
                            {user.classes.length > 0
                                ? (
                                    <div className="class-chip-list">
                                        {user.classes.map((c) => <span key={c.id} className="class-chip">{c.name}</span>)}
                                    </div>
                                )
                                : <p className="classes-empty">{isTeacher ? t("dashboard.noClassesTeacher") : t("dashboard.noClasses")}</p>}
                            <div className="presets-list">
                                <Link className="preset-item" to={isTeacher ? "/classes" : "/join-class"}>
                                    <div className="preset-item-text">
                                        <h3>{isTeacher ? t("nav.classes") : t("dashboard.joinClassTitle")}</h3>
                                        <p>{isTeacher ? t("dashboard.manageClassesDesc") : t("dashboard.joinClassDesc")}</p>
                                    </div>
                                    <img src={AscewArrow67px} alt=""/>
                                </Link>
                            </div>
                        </div>
                    )}
                    {isTeacher && (
                        <div className="curriculum-card">
                            <h2>{t("dashboard.recentHandIns")}</h2>
                            {handIns === null ? null : handIns.length === 0 ? (
                                <p className="classes-empty">{t("dashboard.noHandIns")}</p>
                            ) : (
                                <div className="presets-list">
                                    {handIns.map((h) => (
                                        <div key={`${h.classId}-${h.studentId}-${h.projectId}`} className="preset-item">
                                            <div className="preset-item-text">
                                                <h3>
                                                    <Link className="row-link" to={`/review/${h.classId}/${h.studentId}/${h.projectId}`}>
                                                        {h.studentName}
                                                    </Link>
                                                </h3>
                                                <p>{`${titleOf(h.projectId)} · ${h.className} · ${formatRelativeDate(new Date(h.submittedAt), language)}`}</p>
                                            </div>
                                            {h.late && <span className="class-chip late">{t("dashboard.late")}</span>}
                                            <img src={AscewArrow67px} alt=""/>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="right-panel">
                    <div className="top-row">
                        <h2>{isTeacher ? t("dashboard.curriculumPresets") : t("dashboard.continue")}</h2>
                        <Link to="/all-models">{t("dashboard.viewAllModels")}</Link>
                    </div>
                    <div className="header-row">
                        <p className="project-name">{t("table.colProjectName")}</p>
                        <p className="other-filters">{t("table.colClass")}</p>
                        <p className="other-filters col-when">{isTeacher ? t("table.colDue") : t("table.colLastEdit")}</p>
                        {isTeacher && <span className="publish-col" aria-hidden="true"/>}
                    </div>
                    <div className="recents-list">
                        {projects !== null && rows.length === 0 && (
                            <p className="dashboard-empty">{isTeacher ? t("dashboard.libraryEmpty") : t("dashboard.continueEmpty")}</p>
                        )}
                        {rows.map((project) => (
                            <div key={project.id} className="recent-item">
                                <div className="left-side">
                                    <img src={FileCode18px} alt="" />
                                    <div className="project-recent-name">
                                        <p className="recent-name"><Link className="row-link" to={assignmentPath(project.id)}>{project.title}</Link></p>
                                        {!isTeacher && handedIn(project) && <span className="class-chip handed-in">{t("handIn.done")}</span>}
                                        {!isTeacher && late(project) && <span className="class-chip late">{t("dashboard.late")}</span>}
                                    </div>
                                </div>
                                <div className="other-filters">
                                    <ProjectClasses classes={published[project.id]} isTeacher={isTeacher} own={project.mine}/>
                                </div>
                                <div className="other-filters col-when">
                                    <p className="recent-last-edit">
                                        {isTeacher
                                            ? (due(project) !== null ? formatDueDay(due(project)!, language) : "—")
                                            : lastEdit(project) ? formatRelativeDate(lastEdit(project)!, language) : t("classes.statusNotStarted")}
                                    </p>
                                </div>
                                {isTeacher && (
                                    <div className="publish-col">
                                        <PublishButton
                                            title={project.title}
                                            classes={published[project.id]}
                                            onSave={(classIds, settings) => setProjectClasses(project.id, classIds, settings)}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

interface HandIn {
    studentId: number;
    studentName: string;
    projectId: string;
    classId: number;
    className: string;
    submittedAt: number;
    late: boolean;
}

// Teachers: the latest hand-ins in their classes; null while loading
function useRecentHandIns(isTeacher: boolean) {
    const [handIns, setHandIns] = useState<HandIn[] | null>(null);
    useEffect(() => {
        if (!isTeacher) return;
        let cancelled = false;
        api<{ handIns: HandIn[] }>("/classes/hand-ins").then(({ ok, data }) => {
            if (!cancelled) setHandIns(ok && data.handIns ? data.handIns.slice(0, 6) : []);
        });
        return () => {
            cancelled = true;
        };
    }, [isTeacher]);
    return handIns;
}

export default Dashboard;