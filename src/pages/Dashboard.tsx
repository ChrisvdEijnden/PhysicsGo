import { useNavigate } from "react-router-dom";

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
import { useProjects } from "../lib/useProjects";
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
                            <div className="action-new" onClick={() => navigate(isTeacher ? "/projects/new" : "/modeling")}>
                                <img src={NewFile24px} alt=""/>
                                <div className="action-text">
                                    <h3>{t("dashboard.emptyProjectTitle")}</h3>
                                    <p>{t("dashboard.emptyProjectDesc")}</p>
                                </div>
                            </div>
                            <div className="action-open" onClick={() => navigate("/modeling")}>
                                <img src={FolderOpen24px} alt=""/>
                                <div className="action-text">
                                    <h3>{t("dashboard.openProjectTitle")}</h3>
                                    <p>{t("dashboard.openProjectDesc")}</p>
                                </div>
                            </div>
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
                                <div
                                    className="preset-item"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => navigate(isTeacher ? "/classes" : "/join-class")}
                                    onKeyDown={(e) => e.key === "Enter" && navigate(isTeacher ? "/classes" : "/join-class")}
                                >
                                    <div className="preset-item-text">
                                        <h3>{isTeacher ? t("nav.classes") : t("dashboard.joinClassTitle")}</h3>
                                        <p>{isTeacher ? t("dashboard.manageClassesDesc") : t("dashboard.joinClassDesc")}</p>
                                    </div>
                                    <img src={AscewArrow67px} alt=""/>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="curriculum-card">
                        <h2>{t("dashboard.curriculumPresets")}</h2>
                        <div className="presets-list">
                            {visibleProjects
                                .filter((project) => project.curriculum)
                                .map((project) => (
                                    <div
                                        key={project.id}
                                        className="preset-item"
                                        onClick={() => navigate(
                                            "/modeling",
                                            { state: { presetId: project.id } }
                                        )}>
                                        <div className="preset-item-text">
                                            <h3>{project.title}</h3>
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
                        <a onClick={() => navigate("/all-models")}>{t("dashboard.viewAllModels")}</a>
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
                                <div
                                    key={project.id}
                                    className="recent-item"
                                    onClick={() => navigate(
                                        "/modeling",
                                        { state: { presetId: project.id } }
                                    )}>
                                    <div className="left-side">
                                        <img src={FileCode18px} alt="" />
                                        <div className="project-recent-name">
                                            <p className="recent-name">{project.title}</p>
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