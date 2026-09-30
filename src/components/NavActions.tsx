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
            {/* In a new tab, so open work stays where it is while reading */}
            <a href="#/help" target="_blank" rel="noopener" aria-label={t("nav.helpNewTab")} title={t("nav.help")}>
                <img src={HelpIcon21px} alt=""/>
            </a>
            <UserMenu/>
        </div>
    );
}

export default NavActions;
