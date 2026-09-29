import { useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./dashboard.css";
import "./classes.css";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import NavBrand from "../components/NavBrand";
import FolderOpen24px from "../assets/icons/folderopen-24px.svg";
import NewFile24px from "../assets/icons/newfile-24px.svg";
import AscewArrow67px from "../assets/icons/ascewarrow-67px.svg";
import FileCode18px from "../assets/icons/filecode-18px.svg";

// holds all the projects edited by the user
import { Projects, byLastEdit } from "../data/Projects.tsx";
import { formatRelativeDate } from "../lib/formatRelativeDate.tsx";
import { useTranslation } from "../lib/useTranslations";
import { useAuth } from "../lib/useAuth";

function Dashboard() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { user } = useAuth();
    const isTeacher = user?.role === "teacher";
    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <NavBrand />
                    <div className="spacer"></div>
                    <h2>{t("nav.dashboard")}</h2>
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
                <div className="left-panel">
                    <div className="creator-card">
                        <h2>{t("dashboard.startNewModel")}</h2>
                        <div className="dual-action-buttons">
                            <div className="action-new" onClick={() => navigate("/modeling")}>
                                <img src={NewFile24px} alt="NewFile24px"/>
                                <div className="action-text">
                                    <h3>{t("dashboard.emptyProjectTitle")}</h3>
                                    <p>{t("dashboard.emptyProjectDesc")}</p>
                                </div>
                            </div>
                            <div className="action-open" onClick={() => navigate("/modeling")}>
                                <img src={FolderOpen24px} alt="FolderOpen24px"/>
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
                            {Projects
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
                                        <span className="class-chip">{project.className}</span>
                                        <img src={AscewArrow67px} alt="AscewArrow67px"/>
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
                    </div>
                    <div className="recents-list">
                        {[...Projects]
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
                                        </div>
                                    </div>
                                    <div className="other-filters">
                                        <span className="class-chip">{project.className}</span>
                                    </div>
                                    <div className="other-filters">
                                        <p className="recent-last-edit">{ formatRelativeDate(project.lastEdit) }</p>
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;