import { useNavigate } from "react-router-dom";

import LogoIcon26px from "../assets/icons/logo-26px.svg";
import { useAuth } from "../lib/useAuth";

// Logo and name in the top-left of every page; leads home (the dashboard, or login when signed out)
function NavBrand() {
    const navigate = useNavigate();
    const { user } = useAuth();

    return (
        <button
            type="button"
            className="nav-home"
            aria-label="PhysicsGo"
            onClick={() => navigate(user ? "/dashboard" : "/login")}
        >
            <div className="brand">
                <img src={LogoIcon26px} alt=""/>
            </div>
            <h1>PhysicsGo</h1>
        </button>
    );
}

export default NavBrand;
