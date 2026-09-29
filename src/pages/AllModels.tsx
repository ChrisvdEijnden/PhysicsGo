import { useNavigate } from "react-router-dom";

import "./allmodels.css";
import "./dashboard.css";
import "./classes.css";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import NavBrand from "../components/NavBrand";
import {Projects, byLastEdit, isVisibleTo} from "../data/Projects.tsx";
import { useAuth } from "../lib/useAuth";
import FileCode18px from "../assets/icons/filecode-18px.svg";
import {formatRelativeDate} from "../lib/formatRelativeDate.tsx";
import { useTranslation } from "../lib/useTranslations";

function AllModels() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { user } = useAuth();
    const classNames = user?.classes.map((c) => c.name) ?? [];
    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <NavBrand />
                    <div className="spacer"></div>
                    <h2>{t("nav.allModels")}</h2>
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

            <div className="content-allmodels">
                <div className="panel">
                    <div className="top-row">
                        <h2>{t("allModels.allYourProjects")}</h2>
                        <a onClick={() => navigate("/dashboard")}>{t("allModels.backToDashboard")}</a>
                    </div>
                    <div className="header-row">
                        <p className="project-name">{t("table.colProjectName")}</p>
                        <p className="other-filters">{t("table.colClass")}</p>
                        <p className="other-filters">{t("table.colLastEdit")}</p>
                    </div>
                    <div className="recents-list">
                        {Projects
                            .filter((project) => isVisibleTo(project, classNames))
                            .sort(byLastEdit)
                            .map((project) => (
                                <div
                                    key={project.id}
                                    className="recent-item"
                                    onClick={() => navigate(
                                        "/modeling",
                                        { state: { presetId: project.id } })}
                                >
                                    <div className="left-side">
                                        <img src={FileCode18px} alt="" />
                                        <div className="project-recent-name">
                                            <p className="recent-name">{project.title}</p>
                                        </div>
                                    </div>
                                    <div className="other-filters">
                                        {project.className && <span className="class-chip">{project.className}</span>}
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

export default AllModels;