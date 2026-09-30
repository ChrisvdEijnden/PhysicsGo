import { useNavigate } from "react-router-dom";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import { useTranslation } from "../lib/useTranslations";
import UserMenu from "./UserMenu";

// Settings, help and the user menu in the top-right of every page. The icons are decorative; the buttons carry the name.
function NavActions({ settings = true }: { settings?: boolean }) {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <div className="right-system-actions">
            {settings && (
                <button type="button" aria-label={t("nav.settings")} title={t("nav.settings")} onClick={() => navigate("/settings")}>
                    <img src={SettingsIcon21px} alt=""/>
                </button>
            )}
            {/* Help isn't written yet (WF-6); until then this goes home */}
            <button type="button" aria-label={t("nav.help")} title={t("nav.help")} onClick={() => navigate("/")}>
                <img src={HelpIcon21px} alt=""/>
            </button>
            <UserMenu/>
        </div>
    );
}

export default NavActions;
