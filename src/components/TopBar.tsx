import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import NavBrand from "./NavBrand";
import NavActions from "./NavActions";
import { useAuth } from "../lib/useAuth";
import { useTranslation } from "../lib/useTranslations";

export interface Crumb {
    label: ReactNode;
    // Earlier steps link back; the last one is the page itself
    to?: string;
    // Passed to the page it links to (e.g. which class to show)
    state?: unknown;
}

// The bar at the top of every page: logo, the trail to this page, the page's own actions, then
// settings, help and (signed in) the user menu. Signed in, the trail starts at the dashboard.
export default function TopBar({ crumbs, after, children }: {
    crumbs: Crumb[];
    // Next to the trail, e.g. the modeling page's save status
    after?: ReactNode;
    // The page's actions, shown before settings and help
    children?: ReactNode;
}) {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { pathname } = useLocation();
    const trail = user && pathname !== "/dashboard" ? [{ label: t("nav.dashboard"), to: "/dashboard" }, ...crumbs] : crumbs;

    return (
        <header className="nav">
            <div className="brand-and-breadcrumb">
                <NavBrand/>
                <nav aria-label={t("nav.breadcrumbs")}>
                    <ol className="breadcrumbs">
                        {trail.map((crumb, i) => (
                            <li key={i} className={i === trail.length - 1 ? "current" : undefined}>
                                {crumb.to && i < trail.length - 1
                                    ? <Link className="breadcrumb-link" to={crumb.to} state={crumb.state}>{crumb.label}</Link>
                                    : <span aria-current="page">{crumb.label}</span>}
                            </li>
                        ))}
                    </ol>
                </nav>
                {after}
            </div>
            <div className="system-actions">
                {children}
                <NavActions settings={pathname !== "/settings"}/>
            </div>
        </header>
    );
}
