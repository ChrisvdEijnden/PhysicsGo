import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./dashboard.css";
import "./classes.css";

import NavBrand from "../components/NavBrand";
import NavActions from "../components/NavActions";
import FolderOpen24px from "../assets/icons/folderopen-24px.svg";
import NewFile24px from "../assets/icons/newfile-24px.svg";
import AscewArrow67px from "../assets/icons/ascewarrow-67px.svg";
import FileCode18px from "../assets/icons/filecode-18px.svg";

// holds all the projects edited by the user
import { assignmentPath, useProjects } from "../lib/useProjects";
import type { ProjectFields } from "../lib/useProjects";
import type { ProjectWork } from "../data/Projects";
import { parseAssignmentFile } from "../lib/assignmentFile";
import { api } from "../lib/api";
import { authErrorKey } from "../lib/authErrors";
import { useWorkActivity } from "../lib/useWorkActivity";
import { formatRelativeDate } from "../lib/formatRelativeDate";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth";
import { canSeeProject, usePublished } from "../lib/usePublished";
import ProjectClasses from "../components/ProjectClasses";
import PublishButton from "../components/PublishButton";

function Dashboard() {
    const navigate = useNavigate();
    const { t, language } = useTranslation();
    const { user } = useAuth();
    const isTeacher = user?.role === "teacher";
    const { published, setProjectClasses } = usePublished();
    const { lastEdit, byLastEdit, handedIn } = useWorkActivity();
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
    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <NavBrand />
                    <div className="spacer"></div>
                    <h2>{t("nav.dashboard")}</h2>
                </div>
                <NavActions/>
            </div>

            <div className="content-dashboard">
                <div className="left-panel">
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
                                : !isTeacher && <p className="classes-empty">{t("dashboard.noClasses")}</p>}
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
                    <div className="curriculum-card">
                        <h2>{t("dashboard.curriculumPresets")}</h2>
                        <div className="presets-list">
                            {visibleProjects
                                .filter((project) => project.curriculum)
                                .map((project) => (
                                    // The title's link covers the whole row (dashboard.css); the publish button sits above it
                                    <div key={project.id} className="preset-item">
                                        <div className="preset-item-text">
                                            <h3><Link className="row-link" to={assignmentPath(project.id)}>{project.title}</Link></h3>
                                        </div>
                                        <ProjectClasses classes={published[project.id]} isTeacher={isTeacher} own={project.mine}/>
                                        {isTeacher && (
                                            <PublishButton
                                                title={project.title}
                                                classes={published[project.id]}
                                                onSave={(classIds) => setProjectClasses(project.id, classIds)}
                                            />
                                        )}
                                        <img src={AscewArrow67px} alt=""/>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
                <div className="right-panel">
                    <div className="top-row">
                        <h2>{t("dashboard.recentProjects")}</h2>
                        <Link to="/all-models">{t("dashboard.viewAllModels")}</Link>
                    </div>
                    <div className="header-row">
                        <p className="project-name">{t("table.colProjectName")}</p>
                        <p className="other-filters">{t("table.colClass")}</p>
                        <p className="other-filters">{t("table.colLastEdit")}</p>
                        {isTeacher && <span className="publish-col" aria-hidden="true"/>}
                    </div>
                    <div className="recents-list">
                        {[...visibleProjects]
                            .sort(byLastEdit)
                            .map((project) => (
                                <div key={project.id} className="recent-item">
                                    <div className="left-side">
                                        <img src={FileCode18px} alt="" />
                                        <div className="project-recent-name">
                                            <p className="recent-name"><Link className="row-link" to={assignmentPath(project.id)}>{project.title}</Link></p>
                                            {handedIn(project) && <span className="class-chip handed-in">{t("handIn.done")}</span>}
                                        </div>
                                    </div>
                                    <div className="other-filters">
                                        <ProjectClasses classes={published[project.id]} isTeacher={isTeacher} own={project.mine}/>
                                    </div>
                                    <div className="other-filters">
                                        <p className="recent-last-edit">{ lastEdit(project) ? formatRelativeDate(lastEdit(project)!, language) : t("classes.statusNotStarted") }</p>
                                    </div>
                                    {isTeacher && (
                                        <div className="publish-col">
                                            <PublishButton
                                                title={project.title}
                                                classes={published[project.id]}
                                                onSave={(classIds) => setProjectClasses(project.id, classIds)}
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

export default Dashboard;