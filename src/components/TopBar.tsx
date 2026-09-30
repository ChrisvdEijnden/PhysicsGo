import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import NavBrand from "./NavBrand";
import NavActions from "./NavActions";

// The bar at the top of every page: the logo (which leads to the dashboard) and the page's name,
// then the page's own actions, settings, help and (signed in) the user menu
export default function TopBar({ title, after, children }: {
    // The page's name, or the assignment's (which a student can edit in place)
    title: ReactNode;
    // Next to the trail, e.g. the modeling page's save status
    after?: ReactNode;
    // The page's actions, shown before settings and help
    children?: ReactNode;
}) {
    const { pathname } = useLocation();

    return (
        <header className="nav">
            <div className="brand-and-breadcrumb">
                <NavBrand/>
                <div className="page-title"><span>{title}</span></div>
                {after}
            </div>
            <div className="system-actions">
                {children}
                <NavActions settings={pathname !== "/settings"}/>
            </div>
        </header>
    );
}
