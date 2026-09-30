import { reportSessionEnded } from "./api";
import type { Result } from "./api";

// Media files on the server. A teacher reads a student's files by passing the student's id.
export const mediaUrl = (projectId: string, mediaId: string, userId?: number) =>
    `/api/media/${projectId}/${mediaId}${userId === undefined ? "" : `?user=${userId}`}`;

export async function uploadMedia(projectId: string, mediaId: string, file: Blob): Promise<Result> {
    try {
        const res = await fetch(mediaUrl(projectId, mediaId), {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
        });
        if (res.ok) return { ok: true };
        if (res.status === 401) reportSessionEnded();
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: data.error ?? (res.status === 413 ? "file_too_large" : "server_error") };
    } catch {
        return { ok: false, error: "network" };
    }
}

// Whether the server has the file: true, false, or null when it can't be reached
export async function mediaOnServer(projectId: string, mediaId: string, userId?: number): Promise<boolean | null> {
    try {
        const res = await fetch(mediaUrl(projectId, mediaId, userId), { method: "HEAD" });
        return res.ok ? true : res.status === 404 ? false : null;
    } catch {
        return null;
    }
}

export function deleteServerMedia(projectId: string, mediaId: string) {
    return fetch(mediaUrl(projectId, mediaId), { method: "DELETE" }).catch(() => undefined);
}

// Starter media of a project, which everyone who can open the project can view
export const projectMediaUrl = (projectId: string, mediaId: string) => `/api/projects/${projectId}/media/${mediaId}`;

export async function urlExists(url: string): Promise<boolean> {
    try {
        return (await fetch(url, { method: "HEAD" })).ok;
    } catch {
        return false;
    }
}

// Adds a file to a project's starter media (its author only); resolves with the updated project
export async function uploadProjectMedia<P>(projectId: string, mediaId: string, file: File, category: string): Promise<Result<{ project: P }>> {
    try {
        const params = new URLSearchParams({ name: file.name, category });
        const res = await fetch(`${projectMediaUrl(projectId, mediaId)}?${params}`, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.project) return { ok: true, project: data.project };
        if (res.status === 401) reportSessionEnded();
        return { ok: false, error: data.error ?? (res.status === 413 ? "file_too_large" : "server_error") };
    } catch {
        return { ok: false, error: "network" };
    }
}

export async function deleteProjectMedia<P>(projectId: string, mediaId: string): Promise<Result<{ project: P }>> {
    try {
        const res = await fetch(projectMediaUrl(projectId, mediaId), { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        return res.ok && data.project ? { ok: true, project: data.project } : { ok: false, error: data.error ?? "server_error" };
    } catch {
        return { ok: false, error: "network" };
    }
}
