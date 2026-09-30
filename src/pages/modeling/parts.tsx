import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";

import type { Result } from "../../lib/api";
import { formatDueDate } from "../../lib/formatDueDate";
import type { Publication } from "../../lib/usePublished";
import { useTranslation } from "../../lib/useTranslations";
import type { Feedback, SaveStatus } from "../../lib/workSync";

// Smaller pieces of the modeling page: the tabs on narrow screens, a student's assignment details,
// the bar above a student's work that a teacher is reviewing, a student's editable assignment name,
// and whether the work is saved.

// A teacher looking at a student's work: read-only, either the handed-in copy or the current work
export type ReviewedSubmission = Feedback & { work: unknown; submittedAt: number };

export interface Review {
    classId: number;
    studentId: number;
    studentName: string;
    submittedAt: number | null;
    // The hand-in's feedback, which the teacher edits in the explanation column
    feedback: Feedback | null;
    feedbackUrl: string;
    onFeedback: (feedback: Feedback) => void;
    showing: "submission" | "work";
    hasWork: boolean;
    onShow: (which: "submission" | "work") => void;
}

export type PanelTab = "explanation" | "code" | "analysis";
const PANEL_TABS: PanelTab[] = ["explanation", "code", "analysis"];

// On narrow screens (modeling.css shows them there): one panel at a time
export function PanelTabs({ tab, onChange }: { tab: PanelTab; onChange: (tab: PanelTab) => void }) {
    const { t } = useTranslation();
    const labels: Record<PanelTab, string> = {
        explanation: t("modeling.tabExplanation"),
        code: t("modeling.tabCode"),
        analysis: t("modeling.tabAnalysis"),
    };
    // Arrow keys move between the tabs, as in any tab list
    const onKeyDown = (e: KeyboardEvent) => {
        const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = PANEL_TABS[(PANEL_TABS.indexOf(tab) + step + PANEL_TABS.length) % PANEL_TABS.length];
        onChange(next);
        document.getElementById(`tab-${next}`)?.focus();
    };
    return (
        <div className="modeling-tabs" role="tablist" aria-label={t("modeling.panels")} onKeyDown={onKeyDown}>
            {PANEL_TABS.map((name) => (
                <button
                    key={name}
                    type="button"
                    role="tab"
                    id={`tab-${name}`}
                    aria-selected={tab === name}
                    aria-controls={`panel-${name}`}
                    tabIndex={tab === name ? 0 : -1}
                    className={tab === name ? "active" : undefined}
                    onClick={() => onChange(name)}
                >
                    {labels[name]}
                </button>
            ))}
        </div>
    );
}

// For a student: when the assignment is due and what their teacher added for their class
export function AssignmentInfo({ publications }: { publications: Publication[] }) {
    const { t, language } = useTranslation();
    const shown = publications.filter((p) => p.dueAt !== null || p.instructions);
    if (shown.length === 0) return null;
    return (
        <div className="assignment-info">
            {shown.map((p) => {
                const overdue = p.dueAt !== null && p.dueAt < Date.now();
                return (
                    <div key={p.id} className="assignment-info-class">
                        {p.dueAt !== null && (
                            <p className={`due-label${overdue ? " overdue" : ""}`}>
                                {t(overdue ? "dashboard.overdue" : "dashboard.due", { time: formatDueDate(p.dueAt, language) })}
                                {publications.length > 1 && ` · ${p.name}`}
                            </p>
                        )}
                        {p.instructions && (
                            <p className="assignment-instructions">
                                <strong>{t("modeling.teacherInstructions")}</strong> {p.instructions}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// Whose work a teacher is looking at, and which copy: the handed-in one or the current work
export function ReviewBar({ review }: { review: Review }) {
    const { t, language } = useTranslation();
    const navigate = useNavigate();
    return (
        <div className="review-bar">
            <span className="review-student">
                {review.studentName}
                {review.submittedAt !== null && ` · ${t("handIn.handedInAt", {
                    time: new Date(review.submittedAt).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" }),
                })}`}
                {review.submittedAt === null && ` · ${t("review.notHandedIn")}`}
            </span>
            {review.submittedAt !== null && review.hasWork && (
                <div className="review-toggle" role="radiogroup" aria-label={t("review.whichCopy")}>
                    {(["submission", "work"] as const).map((which) => (
                        <button key={which} type="button" role="radio" aria-checked={review.showing === which}
                                className={review.showing === which ? "active" : ""} onClick={() => review.onShow(which)}>
                            {which === "submission" ? t("review.handedInCopy") : t("review.currentWork")}
                        </button>
                    ))}
                </div>
            )}
            <button type="button" className="review-back" onClick={() => navigate("/classes", { state: { classId: review.classId } })}>
                {t("review.backToClass")}
            </button>
        </div>
    );
}

// A student's own assignment's name, edited in place in the top bar; Enter or leaving the field saves it
export function TitleField({ title, onSave }: { title: string; onSave: (title: string) => Promise<Result> }) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState(title);
    useEffect(() => setDraft(title), [title]);

    const commit = async () => {
        const next = draft.trim();
        if (!next || next === title) return setDraft(title);
        const res = await onSave(next.slice(0, 100));
        if (!res.ok) setDraft(title);
    };

    return (
        <input
            className="title-field"
            aria-label={t("modeling.assignmentName")}
            value={draft}
            maxLength={100}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                    setDraft(title);
                    e.currentTarget.blur();
                }
            }}
        />
    );
}

// Whether the project's latest changes are saved on the server, and otherwise whether this device has them
export function SaveIndicator({ status, localFailed }: { status: SaveStatus; localFailed: boolean }) {
    const { t } = useTranslation();
    const text = {
        saved: t("modeling.saveSaved"),
        saving: t("modeling.saveSaving"),
        offline: t(localFailed ? "modeling.saveOfflineNotKept" : "modeling.saveOffline"),
        error: t(localFailed ? "modeling.saveErrorNotKept" : "modeling.saveError"),
        conflict: t("modeling.saveConflict"),
    }[status];
    return <span className={`save-indicator ${status}`} role="status">{text}</span>;
}
