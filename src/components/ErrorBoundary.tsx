import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useTranslation } from "../lib/useTranslations";
import type { TranslationKey } from "../lib/Translations";

// A rendering error shows a way back instead of a blank page. `resetKey` clears the error when it
// changes (the route, for the app-wide boundary), so navigating away recovers.
export default class ErrorBoundary extends Component<
    { children: ReactNode; resetKey?: unknown; compact?: boolean },
    { error: Error | null; resetKey?: unknown }
> {
    state: { error: Error | null; resetKey?: unknown } = { error: null, resetKey: this.props.resetKey };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    static getDerivedStateFromProps(
        props: { resetKey?: unknown },
        state: { error: Error | null; resetKey?: unknown }
    ) {
        if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
        return null;
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(error, info.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return this.props.compact
            ? <PanelError onRetry={() => this.setState({ error: null })}/>
            : <PageError/>;
    }
}

function PageError() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    return (
        <div className="app-message" role="alert">
            <h1>{t("error.title")}</h1>
            <p>{t("error.description")}</p>
            <div className="app-message-actions">
                <button type="button" className="app-message-button primary" onClick={() => navigate("/dashboard")}>
                    {t("error.toDashboard")}
                </button>
                <button type="button" className="app-message-button" onClick={() => window.location.reload()}>
                    {t("error.reload")}
                </button>
            </div>
        </div>
    );
}

// One panel failing (a chart, a video) leaves the rest of the workspace usable
function PanelError({ onRetry }: { onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="panel-error" role="alert">
            <p>{t("error.panel")}</p>
            <button type="button" className="app-message-button" onClick={onRetry}>{t("error.retry")}</button>
        </div>
    );
}

// An address that isn't a page, or (with its own text) a page for something that isn't there
export function NotFound({ title = "notFound.title", description = "notFound.description" }: {
    title?: TranslationKey;
    description?: TranslationKey;
}) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    return (
        <div className="app-message">
            <h1>{t(title)}</h1>
            <p>{t(description)}</p>
            <div className="app-message-actions">
                <button type="button" className="app-message-button primary" onClick={() => navigate("/dashboard")}>
                    {t("error.toDashboard")}
                </button>
            </div>
        </div>
    );
}
