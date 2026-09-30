import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../lib/useAuth";
import type { Role } from "../lib/useAuth";
import { useTranslation } from "../lib/useTranslations";

// Shown while it's still being checked who is signed in
export function Loading() {
    const { t } = useTranslation();
    return <div className="page-loading" role="status">{t("app.loading")}</div>;
}

// Pages for signed-in users; with `role`, only for teachers or only for students
export function RequireAuth({ role }: { role?: Role }) {
    const { user, loading } = useAuth();
    if (loading) return <Loading/>;
    if (!user) return <Navigate to="/login" replace/>;
    if (role && user.role !== role) return <Navigate to="/dashboard" replace/>;
    return <Outlet/>;
}

// Signing in, joining and resetting a password: a signed-in user goes to their dashboard instead
export function PublicOnly() {
    const { user, loading } = useAuth();
    if (loading) return <Loading/>;
    if (user) return <Navigate to="/dashboard" replace/>;
    return <Outlet/>;
}
