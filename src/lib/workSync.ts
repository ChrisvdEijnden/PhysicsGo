import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "./api";
import { loadProjectWork, loadSyncState, normalizeWork, saveProjectWork, saveSyncState } from "../data/Projects";
import type { ProjectWork } from "../data/Projects";

// Work is saved on the server. This browser keeps a copy per account, so work done offline
// isn't lost and is sent once the server can be reached again.

export type SaveStatus = "saved" | "saving" | "offline" | "error" | "conflict";

// A hand-in: which saved version the teacher sees, and when it was handed in
export interface Submission {
    workVersion: number;
    submittedAt: number;
}

export interface OpenedWork {
    work: ProjectWork | null;
    submission: Submission | null;
    // The server version the work is based on
    version: number;
    // This browser has changes the server hasn't got yet; they're sent right away
    unsynced: boolean;
    offline: boolean;
}

interface ServerWork {
    work: unknown;
    version: number;
    submission?: Submission | null;
}

export async function openWork(projectId: string): Promise<OpenedWork> {
    const local = loadProjectWork(projectId);
    const sync = loadSyncState(projectId);
    const { ok, data } = await api<ServerWork>(`/work/${projectId}`);
    if (!ok || typeof data.version !== "number") {
        return { work: local, submission: null, version: sync?.version ?? 0, unsynced: false, offline: true };
    }

    // Local changes made on top of the server's current version (e.g. while offline) are the newest.
    // Work saved in this browser before it went to the server counts as such when the server has none.
    const localIsNewer = local && (sync ? sync.dirty && sync.version === data.version : data.version === 0);
    const submission = data.submission ?? null;
    if (localIsNewer) return { work: local, submission, version: data.version, unsynced: true, offline: false };

    const work = normalizeWork(data.work);
    if (work) {
        saveProjectWork(projectId, work);
        saveSyncState(projectId, { version: data.version, dirty: false });
    }
    return { work, submission, version: data.version, unsynced: false, offline: false };
}

const SAVE_DELAY_MS = 800;
const RETRY_MS = 10_000;

// Saves a project's work in the background: straight to this browser, then to the server
// after a short pause in typing. Another tab or device saving in between is a conflict.
export function useWorkSync(projectId: string | null, initialVersion: number) {
    const [status, setStatus] = useState<SaveStatus>("saved");
    const [conflict, setConflict] = useState<{ work: ProjectWork; version: number } | null>(null);
    // The latest version saved on the server
    const [version, setVersion] = useState(initialVersion);
    const sync = useRef({ version: initialVersion, pending: null as ProjectWork | null, inFlight: false, timer: 0, blocked: false });

    const flush = useCallback(async () => {
        const s = sync.current;
        window.clearTimeout(s.timer);
        if (!projectId || s.inFlight || s.blocked || !s.pending) return;

        const work = s.pending;
        s.inFlight = true;
        setStatus("saving");
        const { ok, data } = await api<ServerWork & { error?: string }>(`/work/${projectId}`, "PUT", { work, version: s.version });
        s.inFlight = false;

        if (ok && typeof data.version === "number") {
            s.version = data.version;
            setVersion(data.version);
            if (s.pending === work) {
                s.pending = null;
                saveSyncState(projectId, { version: s.version, dirty: false });
                setStatus("saved");
            } else {
                // Changed again while saving
                saveSyncState(projectId, { version: s.version, dirty: true });
                s.timer = window.setTimeout(flush, SAVE_DELAY_MS);
            }
            return;
        }
        if (data.error === "conflict" && typeof data.version === "number") {
            s.blocked = true;
            setConflict({ work: normalizeWork(data.work) ?? work, version: data.version });
            setStatus("conflict");
            return;
        }
        setStatus(data.error === "network" ? "offline" : "error");
        s.timer = window.setTimeout(flush, RETRY_MS);
    }, [projectId]);

    const save = useCallback((work: ProjectWork) => {
        if (!projectId) return;
        const s = sync.current;
        saveProjectWork(projectId, work);
        saveSyncState(projectId, { version: s.version, dirty: true });
        s.pending = work;
        if (s.blocked) return;
        setStatus((current) => (current === "offline" || current === "error" ? current : "saving"));
        window.clearTimeout(s.timer);
        s.timer = window.setTimeout(flush, SAVE_DELAY_MS);
    }, [projectId, flush]);

    // Saves what's waiting right away; resolves with whether everything is on the server
    const saveNow = useCallback(async () => {
        const s = sync.current;
        for (let tries = 0; tries < 10 && (s.pending || s.inFlight) && !s.blocked; tries++) {
            if (s.inFlight) await new Promise((resolve) => setTimeout(resolve, 200));
            else await flush();
        }
        return { saved: !s.pending && !s.inFlight, version: s.version };
    }, [flush]);

    // "Keep mine": save this browser's work over the newer version
    const keepMine = useCallback(() => {
        const s = sync.current;
        if (!conflict) return;
        s.version = conflict.version;
        s.blocked = false;
        setConflict(null);
        flush();
    }, [conflict, flush]);

    // "Use the other version": this browser's copy becomes the server's; the caller reloads it
    const takeTheirs = useCallback(() => {
        if (!projectId || !conflict) return;
        saveProjectWork(projectId, conflict.work);
        saveSyncState(projectId, { version: conflict.version, dirty: false });
        sync.current.pending = null;
    }, [projectId, conflict]);

    // Back online: send what's waiting. Leaving the page: send it now rather than after the pause.
    useEffect(() => {
        window.addEventListener("online", flush);
        return () => {
            window.removeEventListener("online", flush);
            flush();
        };
    }, [flush]);

    return { status, conflict, version, save, saveNow, keepMine, takeTheirs };
}
