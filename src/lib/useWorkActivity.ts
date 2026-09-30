import { useEffect, useState } from "react";

import { api } from "./api";
import { useAuth } from "./useAuth";
import type { Project } from "../data/Projects";

// When the signed-in user last saved work on each project, and when they handed it in
export interface WorkActivity {
    updatedAt: number;
    submittedAt: number | null;
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

    return { lastEdit, byLastEdit, handedIn };
}
