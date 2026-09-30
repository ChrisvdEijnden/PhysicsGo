import { useEffect, useState } from "react";

import "../pages/classes.css";

import type { Result } from "../lib/api";
import type { Submission } from "../lib/workSync";
import { authErrorKey } from "../lib/authErrors";
import { useTranslation } from "../lib/useTranslations";

// Confirms handing in a project, or handing it in again / taking it back when it already is
export default function HandInDialog({ title, submission, changedSince, onHandIn, onRetract, onClose }: {
    title: string;
    submission: Submission | null;
    // The work changed after it was handed in
    changedSince: boolean;
    onHandIn: () => Promise<Result>;
    onRetract: () => Promise<Result>;
    onClose: () => void;
}) {
    const { t, language } = useTranslation();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    async function run(action: () => Promise<Result>) {
        setBusy(true);
        setError(null);
        const res = await action();
        setBusy(false);
        if (res.ok) onClose();
        else setError(res.error);
    }

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="hand-in-title">
                <div className="dialog-header">
                    <h2 id="hand-in-title">{t("handIn.title", { title })}</h2>
                    <p>{t("handIn.description")}</p>
                    {submission && (
                        <p>
                            {t("handIn.handedInAt", {
                                time: new Date(submission.submittedAt).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" }),
                            })}
                            {changedSince && ` ${t("handIn.changedSince")}`}
                        </p>
                    )}
                </div>

                {error && <p className="auth-error class-error" role="alert">{t(authErrorKey(error))}</p>}

                <div className="dialog-actions">
                    {/* Once the teacher has given feedback, the hand-in stays (taking it back would remove the feedback) */}
                    {submission && submission.reviewedAt === null && (
                        <button type="button" className="class-button danger" disabled={busy} onClick={() => run(onRetract)}>
                            {t("handIn.retract")}
                        </button>
                    )}
                    <button type="button" className="class-button" onClick={onClose}>
                        {t("handIn.cancel")}
                    </button>
                    <button type="button" className="class-button primary" disabled={busy} autoFocus onClick={() => run(onHandIn)}>
                        {submission ? t("modeling.handInAgain") : t("handIn.submit")}
                    </button>
                </div>
            </div>
        </div>
    );
}
