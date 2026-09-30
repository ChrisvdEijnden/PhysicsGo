import { useEffect, useState } from "react";

import { api } from "./api";
import { useAuth } from "./useAuth";
import type { Project } from "../data/Projects";
import type { ReviewStatus } from "./workSync";

// When the signed-in user last saved work on each project, when they handed it in, and what the
// teacher made of it
export interface WorkActivity {
    updatedAt: number;
    submittedAt: number | null;
    status: ReviewStatus | null;
    mark: number | null;
}

export function useWorkActivity() {
    const { user } = useAuth();
    const [activity, setActivity] = useState<Record<string, WorkActivity>>({});

    useEffect(() => {
        if (!user) return setActivity({});
        let cancelled = false;
        api<{ work: ({ projectId: string } & WorkActivity)[] }>("/work").then(({ ok, data }) => {
            if (cancelled || !ok || !data.work) return;
            setActivity(Object.fromEntries(data.work.map(({ projectId, ...rest }) => [projectId, rest])));
        });
        return () => {
            cancelled = true;
        };
    }, [user]);

    // When the user last saved work on the project; null when they never have
    const lastEdit = (project: Project) =>
        activity[project.id] ? new Date(activity[project.id].updatedAt) : null;
    // Most recently worked on first, then projects not started yet by title
    const byLastEdit = (a: Project, b: Project) =>
        (lastEdit(b)?.getTime() ?? 0) - (lastEdit(a)?.getTime() ?? 0) || a.title.localeCompare(b.title);
    const handedIn = (project: Project) => activity[project.id]?.submittedAt != null;
    // When the user handed the project in; null when they haven't
    const submittedAt = (project: Project) => activity[project.id]?.submittedAt ?? null;
    // handed_in, returned (for revision) or approved; null when not handed in
    const reviewOf = (project: Project) => {
        const a = activity[project.id];
        return a?.submittedAt != null && a.status ? { status: a.status, mark: a.mark } : null;
    };

    return { lastEdit, byLastEdit, handedIn, submittedAt, reviewOf };
}
