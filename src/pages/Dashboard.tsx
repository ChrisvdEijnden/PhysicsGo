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
    const { projects } = useProjects();
    const visibleProjects = (projects ?? []).filter((project) => canSeeProject(user, published, project.id));
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
                            {/* Teachers start a new project for their classes; students an empty model */}
                            <button type="button" className="action-new" onClick={() => navigate(isTeacher ? "/projects/new" : "/modeling")}>
                                <img src={NewFile24px} alt=""/>
                                <span className="action-text">
                                    <span className="action-title">{t("dashboard.emptyProjectTitle")}</span>
                                    <span className="action-description">{t("dashboard.emptyProjectDesc")}</span>
                                </span>
                            </button>
                            <button type="button" className="action-open" onClick={() => navigate("/modeling")}>
                                <img src={FolderOpen24px} alt=""/>
                                <span className="action-text">
                                    <span className="action-title">{t("dashboard.openProjectTitle")}</span>
                                    <span className="action-description">{t("dashboard.openProjectDesc")}</span>
                                </span>
                            </button>
                        </div>
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
                                        <ProjectClasses classes={published[project.id]} isTeacher={isTeacher}/>
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
                                        <ProjectClasses classes={published[project.id]} isTeacher={isTeacher}/>
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