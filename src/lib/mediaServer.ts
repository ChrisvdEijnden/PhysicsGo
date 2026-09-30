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
