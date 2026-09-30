import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

import "../pages/classes.css";
import { useTranslation } from "../lib/useTranslations";

// Catches a crash while showing its part of the page, so the rest keeps working and the user
// gets a way back instead of a blank page. `compact` is for a single panel.
export default class ErrorBoundary extends Component<{ children: ReactNode; compact?: boolean }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("PhysicsGo crashed:", error, info.componentStack);
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return <Crashed compact={this.props.compact} onRetry={() => this.setState({ failed: false })}/>;
    }
}

function Crashed({ compact, onRetry }: { compact?: boolean; onRetry: () => void }) {
    const { t } = useTranslation();
    if (compact) {
        return (
            <div className="crashed compact" role="alert">
                <p>{t("app.panelCrashed")}</p>
                <button type="button" className="class-button" onClick={onRetry}>{t("app.retry")}</button>
            </div>
        );
    }
    return (
        <div className="crashed" role="alert">
            <h1>{t("app.crashedTitle")}</h1>
            <p>{t("app.crashedText")}</p>
            <div className="crashed-actions">
                <button type="button" className="class-button" onClick={() => window.location.reload()}>{t("app.reload")}</button>
                <button type="button" className="class-button primary" onClick={() => {
                    window.location.hash = "#/dashboard";
                    onRetry();
                }}>{t("app.toDashboard")}</button>
            </div>
        </div>
    );
}
