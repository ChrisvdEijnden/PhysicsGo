import { useNavigate } from "react-router-dom";

import "./allmodels.css";
import "./dashboard.css";
import "./classes.css";

import NavBrand from "../components/NavBrand";
import NavActions from "../components/NavActions";
import { useProjects } from "../lib/useProjects";
import { useWorkActivity } from "../lib/useWorkActivity";
import { useAuth } from "../lib/useAuth";
import { canSeeProject, usePublished } from "../lib/usePublished";
import ProjectClasses from "../components/ProjectClasses";
import PublishButton from "../components/PublishButton";
import FileCode18px from "../assets/icons/filecode-18px.svg";
import {formatRelativeDate} from "../lib/formatRelativeDate";
import { useTranslation } from "../lib/useTranslations";

function AllModels() {
    const navigate = useNavigate();
    const { t, language } = useTranslation();
    const { user } = useAuth();
    const isTeacher = user?.role === "teacher";
    const { published, setProjectClasses } = usePublished();
    const { lastEdit, byLastEdit, handedIn } = useWorkActivity();
    const { projects } = useProjects();
    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <NavBrand />
                    <div className="spacer"></div>
                    <h2>{t("nav.allModels")}</h2>
                </div>
                <NavActions/>
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
                        {isTeacher && <span className="publish-col" aria-hidden="true"/>}
                    </div>
                    <div className="recents-list">
                        {(projects ?? [])
                            .filter((project) => canSeeProject(user, published, project.id))
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

export default AllModels;