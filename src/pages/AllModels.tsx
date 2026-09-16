import { useNavigate } from "react-router-dom";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import LogoIcon26px from "../assets/icons/logo-26px.svg";

function AllModels() {
    const navigate = useNavigate();
    return (
        <div>
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
            </div>

            <div className="content">
                <button onClick={() => navigate("/dashboard")}>
                    Go back to Dashboard
                </button>
            </div>
        </div>
    );
}

export default AllModels;