import { useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./dashboard.css";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import LogoIcon26px from "../assets/icons/logo-26px.svg";
import FolderOpen24px from "../assets/icons/folderopen-24px.svg";
import NewFile24px from "../assets/icons/newfile-24px.svg";
import AscewArrow67px from "../assets/icons/ascewarrow-67px.svg";
import FileCode18px from "../assets/icons/filecode-18px.svg";

// holds all the projects edited by the user
import { Projects } from "../data/Projects.tsx";
import { formatRelativeDate } from "../lib/formatRelativeDate.tsx";
import { useTranslation } from "../lib/useTranslations";

function Dashboard() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <div className="brand">
                        <img src={LogoIcon26px} alt="LogoIcon26px"/>
                    </div>
                    <h1>PhysicsGo</h1>
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
                                            <p>{project.type}</p>
                                        </div>
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
                        <p className="other-filters">{t("table.colType")}</p>
                        <p className="other-filters">{t("table.colLastEdit")}</p>
                    </div>
                    <div className="recents-list">
                        {Projects
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
                                        <p className="recent-type">{project.type}</p>
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