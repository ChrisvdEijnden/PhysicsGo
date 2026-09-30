import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../lib/useAuth";
import type { Role } from "../lib/useAuth";
import { useTranslation } from "../lib/useTranslations";

// Shown while the session is checked, so no page decides anything before it's known who is signed in
export function LoadingScreen() {
    const { t } = useTranslation();
    return (
        <div className="loading-screen" role="status">
            <span className="loading-spinner" aria-hidden="true"/>
            <p>{t("app.loading")}</p>
        </div>
    );
}

// Pages for signed-in users; with a role, only for that role (others go to their dashboard)
export function RequireAuth({ role }: { role?: Role }) {
    const { user, loading } = useAuth();
    if (loading) return <LoadingScreen/>;
    if (!user) return <Navigate to="/login" replace/>;
    if (role && user.role !== role) return <Navigate to="/dashboard" replace/>;
    return <Outlet/>;
}

// Signing in, registering and resetting a password: someone already signed in goes to the dashboard
export function PublicOnly() {
    const { user, loading } = useAuth();
    if (loading) return <LoadingScreen/>;
    if (user) return <Navigate to="/dashboard" replace/>;
    return <Outlet/>;
}

// Pages for everyone (Settings), which still wait for the session so they don't flash the signed-out view
export function WaitForSession() {
    const { loading } = useAuth();
    return loading ? <LoadingScreen/> : <Outlet/>;
}
