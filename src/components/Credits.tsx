import { Link } from "react-router-dom";

import { useTranslation } from "../lib/useTranslations";

// Version, authors and the privacy statement at the foot of the sign-in cards; the version comes from package.json
function Credits() {
    const { t } = useTranslation();
    return (
        <div className="footer-context">
            <p>
                PhysicsGo v{__APP_VERSION__} · C.H.M. van den Eijnden · J.J. van Wegen · <Link to="/privacy">{t("nav.privacy")}</Link>
            </p>
        </div>
    );
}

export default Credits;
