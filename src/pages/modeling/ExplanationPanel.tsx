import type { CSSProperties } from "react";

import ChevronLeft16px from "../../assets/icons/chevron-left-16px.svg";
import ChevronRight16px from "../../assets/icons/chevron-right-16px.svg";
import { FeedbackForm, FeedbackView } from "../../components/Feedback";
import Markdown from "../../components/Markdown";
import type { Project } from "../../data/Projects.tsx";
import type { Publication } from "../../lib/usePublished";
import { useTranslation } from "../../lib/useTranslations";
import type { Submission } from "../../lib/workSync";
import { AssignmentInfo } from "./parts";
import type { Review } from "./parts";

// The left column: the assignment's explanation, with the teacher's feedback (editable when
// reviewing, read-only for the student) and the student's due date and instructions. It folds away to
// a narrow strip.
export default function ExplanationPanel({ project, style, collapsed, onToggle, review, student, submission, publications }: {
    project: Project | undefined;
    style: CSSProperties | undefined;
    collapsed: boolean;
    onToggle: () => void;
    review: Review | undefined;
    // A student working on the assignment (not a teacher, and not reviewing)
    student: boolean;
    submission: Submission | null;
    publications: Publication[];
}) {
    const { t } = useTranslation();
    const toggleLabel = collapsed ? t("modeling.expandExplanation") : t("modeling.collapseExplanation");
    return (
        <div className={`explanation-panel${collapsed ? " collapsed" : ""}`} id="panel-explanation" style={style}>
            <button
                type="button"
                className="panel-toggle"
                onClick={onToggle}
                aria-expanded={!collapsed}
                aria-controls="explanation-content"
                aria-label={toggleLabel}
                title={toggleLabel}
            >
                <img src={collapsed ? ChevronRight16px : ChevronLeft16px} alt=""/>
                {collapsed && <span className="panel-toggle-label">{t("modeling.tabExplanation")}</span>}
            </button>
            <div className="explanation" id="explanation-content">
                {review?.feedback && <FeedbackForm url={review.feedbackUrl} initial={review.feedback} onSaved={review.onFeedback}/>}
                {project && student && submission && <FeedbackView feedback={submission}/>}
                {project && student && <AssignmentInfo publications={publications}/>}
                {project && <Markdown text={project.explanation}/>}
            </div>
            {project && (
                <div className="explanation-footer">
                    {project.estimatedTime !== null && (
                        <>
                            <span>{t("modeling.estimatedTime")} <strong>{t("modeling.minutes", { n: project.estimatedTime })}</strong></span>
                            <span className="code-footer-dot">·</span>
                        </>
                    )}
                    <span>{t("modeling.equipment")} <strong>
                        {project.equipment.length > 0 ? project.equipment.join(", ") : t("modeling.equipmentNone")}
                    </strong></span>
                </div>
            )}
        </div>
    );
}
