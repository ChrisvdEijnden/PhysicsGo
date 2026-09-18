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

// this will later hold the teacher's curriculum presets
import { curriculumPresets } from "../data/curriculumPresets.tsx";
// this will later hold the recent projects
import { recentProjects } from "../data/recentsProjects.tsx";

function Dashboard() {
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
                    <h2>Dashboard</h2>
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
                <div className="left-panel">
                    <div className="creator-card">
                        <h2>Start New Model</h2>
                        <div className="dual-action-buttons">
                            <div className="action-new" onClick={() => navigate("/modeling")}>
                                <img src={NewFile24px} alt="NewFile24px"/>
                                <div className="action-text">
                                    <h3>Empty Project</h3>
                                    <p>Pure numeric code editor</p>
                                </div>
                            </div>
                            <div className="action-open" onClick={() => navigate("/modeling")}>
                                <img src={FolderOpen24px} alt="FolderOpen24px"/>
                                <div className="action-text">
                                    <h3>Open Project</h3>
                                    <p>From local device or cloud</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="curriculum-card">
                        <h2>Curriculum Presets</h2>
                        <div className="presets-list">
                            {curriculumPresets.map((preset) => (
                                <div
                                    key={preset.id}
                                    className="preset-item"
                                    onClick={() => navigate(
                                        "/modeling",
                                        { state: { presetId: preset.id } }
                                    )}>
                                    <div className="preset-item-text">
                                        <h3>{preset.title}</h3>
                                        <p>{preset.type}</p>
                                    </div>
                                    <img src={AscewArrow67px} alt="AscewArrow67px"/>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="right-panel">
                    <div className="top-row">
                        <h2>Your Recent Projects</h2>
                        <a onClick={() => navigate("/all-models")}>View All Models</a>
                    </div>
                    <div className="header-row">
                        <p className="project-name">Project Name</p>
                        <p className="other-filters">Type</p>
                        <p className="other-filters">Last Edit</p>
                    </div>
                    <div className="recents-list">
                        {recentProjects.map((project) => (
                            <div
                                key={project.id}
                                className="recent-item"
                                onClick={() => navigate("/modeling", { state: { projectId: project.id } })}
                            >
                                <img src={FileCode18px} alt="" />
                                <div className="project-recent-name">
                                    <p className="recent-name">{project.name}</p>
                                </div>
                                <div className="other-filters">
                                    <p className="recent-type">{project.type}</p>
                                </div>
                                <div className="other-filters">
                                    <p className="recent-last-edit">{project.lastEdit}</p>
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