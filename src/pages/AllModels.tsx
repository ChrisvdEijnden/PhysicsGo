import { useNavigate } from "react-router-dom";

import "./allmodels.css";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import LogoIcon26px from "../assets/icons/logo-26px.svg";
import {Projects} from "../data/Projects.tsx";
import FileCode18px from "../assets/icons/filecode-18px.svg";
import {formatRelativeDate} from "../lib/formatRelativeDate.tsx";

function AllModels() {
    const navigate = useNavigate();
    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <div className="brand">
                        <img src={LogoIcon26px} alt="LogoIcon26px"/>
                    </div>
                    <h1>PhysicsGo</h1>
                    <div className="spacer"></div>
                    <h2>All Models</h2>
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

            <div className="content">
                <div className="panel">
                    <h2>Your Recent Projects</h2>
                    <div className="header-row">
                        <p className="project-name">Project Name</p>
                        <p className="other-filters">Type</p>
                        <p className="other-filters">Last Edit</p>
                    </div>
                    <div className="recents-list">
                        {Projects
                            .map((project) => (
                                <div
                                    key={project.id}
                                    className="recent-item"
                                    onClick={() => navigate(
                                        "/modeling",
                                        { state: { projectId: project.id } })}
                                >
                                    <img src={FileCode18px} alt="" />
                                    <div className="project-recent-name">
                                        <p className="recent-name">{project.title}</p>
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
                <button onClick={() => navigate("/dashboard")}>
                    Go back to Dashboard
                </button>
            </div>
        </div>
    );
}

export default AllModels;