import { useCallback, useEffect, useState } from "react";

import { api, errorOf } from "./api";
import type { Result } from "./api";
import { useAuth } from "./useAuth";
import type { AuthUser, ClassRef } from "./useAuth";

// For each project id, the user's own classes it's published to
export type PublishedMap = Record<string, ClassRef[]>;

// Teachers see every project; students only those published to one of their classes
export function canSeeProject(user: AuthUser | null, published: PublishedMap, projectId: string) {
    if (!user) return false;
    return user.role === "teacher" || (published[projectId]?.length ?? 0) > 0;
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

    // Teachers: open the project to exactly these of their classes
    const setProjectClasses = useCallback(async (projectId: string, classIds: number[]): Promise<Result> => {
        const { ok, data } = await api<{ classes: ClassRef[] }>(
            `/projects/${encodeURIComponent(projectId)}/classes`, "PUT", { classIds }
        );
        if (!ok || !data.classes) return { ok: false, error: errorOf(data) };
        const classes = data.classes;
        setPublished((current) => ({ ...current, [projectId]: classes }));
        return { ok: true };
    }, []);

    return { published, loaded, setProjectClasses };
}
