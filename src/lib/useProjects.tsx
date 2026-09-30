import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api, errorOf } from "./api";
import type { Result } from "./api";
import { useAuth } from "./useAuth";
import type { Project } from "../data/Projects";

// The modeling page for an assignment; the address can be shared and bookmarked
export const assignmentPath = (projectId: string) => `/modeling/${encodeURIComponent(projectId)}`;

// What a teacher fills in for a project
export type ProjectFields = Pick<Project, "title" | "explanation" | "start" | "model" | "estimatedTime" | "equipment">;

interface ProjectsContextValue {
    // Null until loaded for the signed-in user
    projects: Project[] | null;
    byId: (id: string | undefined) => Project | undefined;
    // With copyOf, the other project's starter media is copied too
    createProject: (fields: ProjectFields & { copyOf?: string }) => Promise<Result<{ project: Project }>>;
    // Takes a project as the server just sent it (e.g. after changing its media)
    replaceProject: (project: Project) => void;
    updateProject: (id: string, fields: Partial<ProjectFields>) => Promise<Result<{ project: Project }>>;
    deleteProject: (id: string) => Promise<Result>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

// The projects the signed-in user can open: built-in presets, teachers' own projects and
// what's published to their classes (the server decides which)
export function ProjectsProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const [projects, setProjects] = useState<Project[] | null>(null);

    const load = useCallback(async () => {
        const { ok, data } = await api<{ projects: Project[] }>("/projects");
        setProjects(ok && data.projects ? data.projects : []);
    }, []);

    useEffect(() => {
        setProjects(null);
        if (userId !== null) load();
    }, [userId, load]);

    const byId = useCallback((id: string | undefined) => projects?.find((p) => p.id === id), [projects]);

    const createProject = useCallback(async (fields: ProjectFields & { copyOf?: string }): Promise<Result<{ project: Project }>> => {
        const { ok, data } = await api<{ project: Project }>("/projects", "POST", fields);
        if (!ok || !data.project) return { ok: false, error: errorOf(data) };
        const project = data.project;
        setProjects((list) => [...(list ?? []), project].sort((a, b) => a.title.localeCompare(b.title)));
        return { ok: true, project };
    }, []);

    const replaceProject = useCallback((project: Project) => {
        setProjects((list) => list?.map((p) => (p.id === project.id ? project : p)) ?? list);
    }, []);

    const updateProject = useCallback(async (id: string, fields: Partial<ProjectFields>): Promise<Result<{ project: Project }>> => {
        const { ok, data } = await api<{ project: Project }>(`/projects/${id}`, "PATCH", fields);
        if (!ok || !data.project) return { ok: false, error: errorOf(data) };
        const project = data.project;
        setProjects((list) => list?.map((p) => (p.id === id ? project : p)) ?? list);
        return { ok: true, project };
    }, []);

    const deleteProject = useCallback(async (id: string): Promise<Result> => {
        const { ok, data } = await api(`/projects/${id}`, "DELETE");
        if (!ok) return { ok: false, error: errorOf(data) };
        setProjects((list) => list?.filter((p) => p.id !== id) ?? list);
        return { ok: true };
    }, []);

    const value = useMemo(
        () => ({ projects, byId, createProject, replaceProject, updateProject, deleteProject }),
        [projects, byId, createProject, replaceProject, updateProject, deleteProject]
    );
    return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
    const ctx = useContext(ProjectsContext);
    if (!ctx) throw new Error("useProjects must be used inside <ProjectsProvider>");
    return ctx;
}
