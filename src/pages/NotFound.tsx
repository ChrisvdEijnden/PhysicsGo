import { useNavigate } from "react-router-dom";

import "../styles/global.css";
import "./classes.css";

import TopBar from "../components/TopBar";
import { useTranslation } from "../lib/useTranslations";

function NotFound() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    return (
        <div>
            <TopBar crumbs={[{ label: t("app.notFoundTitle") }]}/>
            <div className="crashed" role="alert">
                <h1>{t("app.notFoundTitle")}</h1>
                <p>{t("app.notFoundText")}</p>
                <div className="crashed-actions">
                    <button type="button" className="class-button primary" onClick={() => navigate("/dashboard")}>
                        {t("app.toDashboard")}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default NotFound;
