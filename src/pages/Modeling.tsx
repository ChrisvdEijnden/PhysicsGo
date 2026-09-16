import { useNavigate } from "react-router-dom";

import "./global.css";
import "./modeling.css";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import LogoIcon26px from "../assets/icons/logo-26px.svg";
import arrowIcon14px from "../assets/icons/arrow-14px.svg";


function Modeling() {
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
                    <h2>***Placeholder for project name***</h2>
                </div>

                <div className="system-actions">
                    <button onClick={() => navigate("/dashboard")}>
                        <div className="hand-in-btn">
                            <img src={arrowIcon14px} alt="ArrowIcon14px"/>
                            <p>Hand in Assignment</p>
                        </div>
                    </button>
                    <div className="right-system-actions">
                        <button onClick={() => navigate("/settings")}>
                            <img src={SettingsIcon21px} alt="SettingsIcon21px"/>
                        </button>
                        <button onClick={() => navigate("/")}>
                            <img src={HelpIcon21px} alt="HelpIcon21px"/>
                        </button>
                    </div>
                </div>
            </div>

            <div className="content">
            </div>
        </div>
    );
}

export default Modeling;