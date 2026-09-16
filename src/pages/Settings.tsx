import { useNavigate } from "react-router-dom";

import "./global.css";
import HelpIcon from "../assets/icons/circle-help.svg";

function Settings() {
    const navigate = useNavigate();
    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <div className="spacer"></div>
                    <h1>Settings</h1>
                </div>
                <div className="right-system-actions">
                    <button onClick={() => navigate("/")}>
                        <img src={HelpIcon} alt="HelpIcon"/>
                    </button>
                </div>
            </div>


            <div className="content">
            </div>
        </div>
    );
}

export default Settings;