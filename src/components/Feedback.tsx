import "../pages/classes.css";

import { useState } from "react";

import { api, errorOf } from "../lib/api";
import { authErrorKey } from "../lib/authErrors";
import { useTranslation } from "../lib/useTranslations";
import type { Feedback, ReviewStatus } from "../lib/workSync";

const STATUSES: ReviewStatus[] = ["handed_in", "returned", "approved"];

// A mark as the Dutch write it: 7,5 (or 7.5 in English)
export const formatMark = (mark: number, language: string) =>
    mark.toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function statusLabel(status: ReviewStatus, t: ReturnType<typeof useTranslation>["t"]) {
    return status === "returned" ? t("feedback.returned") : status === "approved" ? t("feedback.approved") : t("feedback.handedIn");
}

// Teachers, reviewing a student's hand-in: status, a mark and a comment for the student
export function FeedbackForm({ url, initial, onSaved }: {
    // The API address of this hand-in's feedback
    url: string;
    initial: Feedback;
    onSaved: (feedback: Feedback) => void;
}) {
    const { t, language } = useTranslation();
    const [status, setStatus] = useState<ReviewStatus>(initial.status);
    const [mark, setMark] = useState(initial.mark === null ? "" : String(initial.mark).replace(".", language === "nl" ? "," : "."));
    const [comment, setComment] = useState(initial.feedback);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const parsedMark = mark.trim() === "" ? null : Number(mark.replace(",", "."));
    const markValid = parsedMark === null || (Number.isFinite(parsedMark) && parsedMark >= 1 && parsedMark <= 10);

    async function save(e: React.FormEvent) {
        e.preventDefault();
        if (!markValid) return setError("invalid_mark");
        setBusy(true);
        setError(null);
        const { ok, data } = await api<{ submission: Feedback }>(url, "PUT", { status, feedback: comment, mark: parsedMark });
        setBusy(false);
        if (!ok || !data.submission) return setError(errorOf(data));
        setSaved(true);
        onSaved(data.submission);
    }

    const touch = () => {
        setSaved(false);
        setError(null);
    };

    return (
        <form className="feedback-box" onSubmit={save}>
            <p className="feedback-title">{t("feedback.title")}</p>
            <div className="feedback-status" role="radiogroup" aria-label={t("feedback.status")}>
                {STATUSES.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={status === s} className={status === s ? "active" : ""}
                            onClick={() => {
                                setStatus(s);
                                touch();
                            }}>
                        {statusLabel(s, t)}
                    </button>
                ))}
            </div>
            <label className="feedback-field">
                <span>{t("feedback.mark")}</span>
                <input className="class-input feedback-mark" inputMode="decimal" value={mark} placeholder="—"
                       aria-invalid={!markValid} onChange={(e) => {
                           setMark(e.target.value);
                           touch();
                       }}/>
            </label>
            <label className="feedback-field">
                <span>{t("feedback.comment")}</span>
                <textarea className="class-input" rows={4} maxLength={5000} value={comment} placeholder={t("feedback.commentPlaceholder")}
                          onChange={(e) => {
                              setComment(e.target.value);
                              touch();
                          }}/>
            </label>
            {error && <p className="class-error" role="alert">{error === "invalid_mark" ? t("feedback.errMark") : t(authErrorKey(error))}</p>}
            <div className="feedback-actions">
                {saved && <span className="feedback-saved" role="status">{t("feedback.saved")}</span>}
                <button type="submit" className="class-button primary" disabled={busy}>{t("feedback.save")}</button>
            </div>
        </form>
    );
}

// Students: what their teacher said about the hand-in, above the explanation
export function FeedbackView({ feedback }: { feedback: Feedback }) {
    const { t, language } = useTranslation();
    if (feedback.reviewedAt === null) return null;
    return (
        <div className={`feedback-box view status-${feedback.status}`} role="status">
            <p className="feedback-title">
                {statusLabel(feedback.status, t)}
                {feedback.mark !== null && <span className="feedback-mark-view">{formatMark(feedback.mark, language)}</span>}
            </p>
            {feedback.feedback && <p className="feedback-text">{feedback.feedback}</p>}
            {feedback.reviewedBy && (
                <p className="feedback-by">
                    {t("feedback.by", {
                        name: feedback.reviewedBy,
                        time: new Date(feedback.reviewedAt).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" }),
                    })}
                </p>
            )}
        </div>
    );
}
