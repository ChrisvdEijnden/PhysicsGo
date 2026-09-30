import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "./modeling.css";

import { NotFound } from "../components/ErrorBoundary";
import { LoadingScreen } from "../components/RouteGuards";
import { normalizeWork } from "../data/Projects.tsx";
import { api, errorOf } from "../lib/api";
import { authErrorKey } from "../lib/authErrors";
import { useAuth } from "../lib/useAuth";
import { useProjects } from "../lib/useProjects";
import { useTranslation } from "../lib/useTranslations";
import { openWork } from "../lib/workSync";
import type { OpenedWork } from "../lib/workSync";
import ModelingWorkspace from "./modeling/Workspace";
import type { ReviewedSubmission } from "./modeling/parts";

// The three ways into the modeling workspace (modeling/Workspace.tsx): a student's (or teacher's)
// own work on an assignment, a teacher reviewing a student's work, and a teacher previewing an
// assignment the way students first see it.

const NO_WORK: OpenedWork = { work: null, submission: null, version: 0, unsynced: false, offline: false, conflictWith: null };

// The assignment comes from the address (/modeling/<id>), so it can be linked, bookmarked and opened in a
// new tab; /modeling alone is an empty workspace. Work is saved per account, so the workspace only opens
// once it's known who is signed in and their work has loaded; a different account gets a fresh workspace.
function Modeling() {
    const { projectId } = useParams();
    const { user } = useAuth();
    const { projects, byId } = useProjects();
    // Only assignments this account may open are loaded, so anything else isn't found
    const project = byId(projectId);
    // The loaded work and the assignment it belongs to: switching assignments never opens one with another's work
    const [opened, setOpened] = useState<{ projectId: string | null; work: OpenedWork } | null>(null);
    // Bumped to load the work again, e.g. after choosing another device's version
    const [reloads, setReloads] = useState(0);
    // Only another account reopens the work. The same person signing in again after their session
    // ended keeps the open workspace, which then sends what couldn't be saved (reopening at that
    // moment would race with that save and look like a conflict).
    const userId = user?.id ?? null;
    // Likewise renaming the assignment (a new project object with the same id) doesn't reopen it
    const openId = project?.id ?? null;
    const projectsLoaded = projects !== null;

    useEffect(() => {
        if (userId === null || !projectsLoaded) return;
        if (openId === null) return setOpened({ projectId: null, work: NO_WORK });
        let cancelled = false;
        setOpened(null);
        openWork(openId).then((work) => {
            if (!cancelled) setOpened({ projectId: openId, work });
        });
        return () => {
            cancelled = true;
        };
    }, [userId, projectsLoaded, openId, reloads]);

    if (!user || projects === null) return <LoadingScreen/>;
    if (projectId !== undefined && !project) {
        return <NotFound title="modeling.notFoundTitle" description="modeling.notFoundDescription"/>;
    }
    if (!opened || opened.projectId !== (project?.id ?? null)) return <LoadingScreen/>;
    return (
        <ModelingWorkspace
            key={`${user.id}-${opened.projectId}-${reloads}`}
            project={project}
            opened={opened.work}
            onReload={() => setReloads((n) => n + 1)}
        />
    );
}

// A teacher's read-only view of a student's work on a project published to their class
export function ReviewWork() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const params = useParams();
    const classId = Number(params.classId);
    const studentId = Number(params.userId);
    const { projects, byId } = useProjects();
    const project = byId(params.projectId);
    const [data, setData] = useState<{ student: { name: string }; work: unknown; submission: ReviewedSubmission | null } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showing, setShowing] = useState<"submission" | "work">("submission");

    useEffect(() => {
        if (user?.role !== "teacher" || !project) return;
        api<{ student: { name: string }; work: unknown; submission: ReviewedSubmission | null }>(
            `/classes/${classId}/students/${studentId}/work/${project.id}`
        ).then(({ ok, data }) => {
            if (!ok || !data.student) return setError(errorOf(data));
            setData({ student: data.student, work: data.work ?? null, submission: data.submission ?? null });
            setShowing(data.submission ? "submission" : "work");
        });
    }, [user, project, classId, studentId]);

    if (projects === null) return null;
    if (!project || error) {
        return <p className="review-error" role="alert">{t(authErrorKey(error ?? "not_found"))}</p>;
    }
    if (!data) return null;

    const work = normalizeWork(showing === "submission" ? data.submission?.work : data.work);
    return (
        <ModelingWorkspace
            key={showing}
            project={project}
            opened={{ ...NO_WORK, work }}
            onReload={() => undefined}
            review={{
                classId,
                studentId,
                studentName: data.student.name,
                submittedAt: data.submission?.submittedAt ?? null,
                feedback: data.submission,
                feedbackUrl: `/classes/${classId}/students/${studentId}/work/${project.id}/feedback`,
                onFeedback: (feedback) => setData((d) => d && d.submission ? { ...d, submission: { ...d.submission, ...feedback } } : d),
                showing,
                hasWork: data.work !== null,
                onShow: setShowing,
            }}
        />
    );
}

// A teacher trying a project the way a student first sees it: nothing is saved
export function PreviewProject() {
    const { projectId } = useParams();
    const { projects, byId } = useProjects();
    const project = byId(projectId);

    if (projects === null || !project) return null;
    return <ModelingWorkspace key={project.id} project={project} opened={NO_WORK} onReload={() => undefined} preview/>;
}

export default Modeling;
