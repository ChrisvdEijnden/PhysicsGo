import { useCallback, useEffect, useState } from "react";

import { api, errorOf } from "./api";
import type { Result } from "./api";
import { useAuth } from "./useAuth";
import type { AuthUser, ClassRef } from "./useAuth";
import { useRefreshOnReturn } from "./useRefreshOnReturn";

// A class an assignment is published to, with that class's instructions, when it opens (students
// don't see it before) and when it's due; times in ms
export interface Publication extends ClassRef {
    instructions: string;
    opensAt: number | null;
    dueAt: number | null;
}

export type PublicationSettings = Pick<Publication, "instructions" | "opensAt" | "dueAt">;

// For each project id, the user's own classes it's published to
export type PublishedMap = Record<string, Publication[]>;

// The earliest due date of the assignment in the user's classes; null when it has none
export function dueDate(publications: Publication[] | undefined): number | null {
    const due = (publications ?? []).map((p) => p.dueAt).filter((d) => d !== null);
    return due.length > 0 ? Math.min(...due) : null;
}

// Teachers see every project; students those published to one of their classes and their own
export function canSeeProject(user: AuthUser | null, published: PublishedMap, project: { id: string; mine: boolean }) {
    if (!user) return false;
    return user.role === "teacher" || project.mine || (published[project.id]?.length ?? 0) > 0;
}

export function usePublished() {
    const { user } = useAuth();
    const [published, setPublished] = useState<PublishedMap>({});
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!user) {
            setPublished({});
            setLoaded(true);
            return;
        }
        let cancelled = false;
        setLoaded(false);
        api<{ published: PublishedMap }>("/projects/published").then(({ ok, data }) => {
            if (cancelled) return;
            setPublished(ok && data.published ? data.published : {});
            setLoaded(true);
        });
        return () => {
            cancelled = true;
        };
    }, [user]);

    // Coming back to the page: what was published meanwhile (a co-teacher, another device)
    useRefreshOnReturn(useCallback(() => {
        if (!user) return;
        api<{ published: PublishedMap }>("/projects/published").then(({ ok, data }) => {
            if (ok && data.published) {
                const next = data.published;
                setPublished((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
            }
        });
    }, [user]));

    // Teachers: open the project to exactly these of their classes, with the given settings per class
    const setProjectClasses = useCallback(async (
        projectId: string, classIds: number[], settings: Record<number, PublicationSettings> = {},
    ): Promise<Result> => {
        const { ok, data } = await api<{ classes: Publication[] }>(
            `/projects/${encodeURIComponent(projectId)}/classes`, "PUT", { classIds, settings }
        );
        if (!ok || !data.classes) return { ok: false, error: errorOf(data) };
        const classes = data.classes;
        setPublished((current) => ({ ...current, [projectId]: classes }));
        return { ok: true };
    }, []);

    return { published, loaded, setProjectClasses };
}
