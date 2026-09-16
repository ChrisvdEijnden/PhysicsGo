import { useNavigate } from "react-router-dom";

import "../styles/global.css";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import LogoIcon26px from "../assets/icons/logo-26px.svg";

function Settings() {
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
                    <h2>Settings</h2>
                </div>
                <div className="right-system-actions">
                    <button onClick={() => navigate("/")}>
                        <img src={HelpIcon21px} alt="HelpIcon21px"/>
                    </button>
                </div>
            </div>


            <div className="content">
            </div>
        </div>
    );
}

export default Settings;