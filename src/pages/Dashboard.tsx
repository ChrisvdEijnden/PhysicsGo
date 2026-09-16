import { useNavigate } from "react-router-dom";

import "../styles/global.css";
import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import LogoIcon26px from "../assets/icons/logo-26px.svg";


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
                <button onClick={() => navigate("/modeling")}>
                    Go to Modeling
                </button>
                <button onClick={() => navigate("/all-models")}>
                    View All Models
                </button>
            </div>
        </div>
    );
}

export default Dashboard;