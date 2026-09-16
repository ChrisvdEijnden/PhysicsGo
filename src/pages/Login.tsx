import { useNavigate } from "react-router-dom";

import "./global.css";
import SettingsIcon from "../assets/icons/settings.svg";
import HelpIcon from "../assets/icons/circle-help.svg";

function Login() {
    const navigate = useNavigate();
    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <div className="spacer"></div>
                    <h1>Login</h1>
                </div>
                <div className="right-system-actions">
                    <button onClick={() => navigate("/settings")}>
                        <img src={SettingsIcon} alt="SettingsIcon"/>
                    </button>
                    <button onClick={() => navigate("/")}>
                        <img src={HelpIcon} alt="HelpIcon"/>
                    </button>
                </div>
            </div>
            <div className="content">
                <button onClick={() => navigate("/dashboard")}>Login
                    Go to Dashboard
                </button>
            </div>
        </div>
    );
}

export default Login;