import express from "express";
import fs from "node:fs";
import db from "./db.js";
import { PROJECT_ID, canOpenProject } from "./projects.js";
import { MAX_FILE, MEDIA_ID, QUOTA, allowedType, mediaPath, requestMime, sendMedia, storeUpload } from "./media.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// Saved work (code, graphs, points) per account, all projects together (PHYSICSGO_WORK_QUOTA_MB)
const WORK_QUOTA = (Number(process.env.PHYSICSGO_WORK_QUOTA_MB) || 50) * 1024 * 1024;

// A user's saved work on a project; version 0 and no work when nothing is saved yet
export function readWork(userId, projectId) {
    const row = db.prepare("SELECT data, version, updated_at FROM project_work WHERE user_id = ? AND project_id = ?")
        .get(userId, projectId);
    return row
        ? { work: JSON.parse(row.data), version: row.version, updatedAt: row.updated_at }
        : { work: null, version: 0, updatedAt: null };
}

// The work a student handed in for a project, or null
export function readSubmission(userId, projectId) {
    const row = db.prepare(`
        SELECT s.*, u.name AS reviewer FROM submissions s LEFT JOIN users u ON u.id = s.reviewed_by
        WHERE s.user_id = ? AND s.project_id = ?
    `).get(userId, projectId);
    return row ? { work: JSON.parse(row.data), workVersion: row.work_version, submittedAt: row.submitted_at, ...feedbackOf(row) } : null;
}

// What a teacher said about a hand-in (see migration 14)
export function feedbackOf(row) {
    return {
        status: row.status,
        feedback: row.feedback,
        mark: row.mark,
        reviewedAt: row.reviewed_at,
        reviewedBy: row.reviewer ?? null,
    };
}

// Earlier hand-ins of a project that the teacher had reviewed before the student handed in again,
// newest first (see migration 19). With `withWork`, also the work that was handed in then.
export function readSubmissionHistory(userId, projectId, { withWork = false } = {}) {
    return db.prepare(`
        SELECT h.*, u.name AS reviewer FROM submission_history h LEFT JOIN users u ON u.id = h.reviewed_by
        WHERE h.user_id = ? AND h.project_id = ? ORDER BY h.submitted_at DESC
    `).all(userId, projectId).map((row) => ({
        submittedAt: row.submitted_at,
        workVersion: row.work_version,
        replacedAt: row.replaced_at,
        ...feedbackOf(row),
        ...(withWork ? { work: JSON.parse(row.data) } : {}),
    }));
}

// Whether the project is an assignment in one of the student's classes (not archived, not taken back,
// and open by now)
function publishedToStudent(userId, projectId) {
    return Boolean(db.prepare(`
        SELECT 1 FROM project_classes pc
        JOIN class_students s ON s.class_id = pc.class_id
        JOIN classes c ON c.id = pc.class_id AND c.archived_at IS NULL
        WHERE pc.project_id = ? AND s.user_id = ? AND pc.unpublished_at IS NULL
          AND (pc.opens_at IS NULL OR pc.opens_at <= ?)
    `).get(projectId, userId, Date.now()));
}

const mediaIdsOf = (work) => new Set((Array.isArray(work?.media) ? work.media : []).map((m) => m?.id));

// Media files that handed-in copies of the work use: the current hand-in and earlier reviewed ones
function handedInMediaIds(userId, projectId) {
    return new Set([
        ...mediaIdsOf(readSubmission(userId, projectId)?.work),
        ...readSubmissionHistory(userId, projectId, { withWork: true }).flatMap((h) => [...mediaIdsOf(h.work)]),
    ]);
}

// Removes files that neither the current work nor any handed-in copy uses anymore
async function pruneMedia(userId, projectId) {
    const used = new Set([
        ...mediaIdsOf(readWork(userId, projectId).work),
        ...handedInMediaIds(userId, projectId),
    ]);
    const files = db.prepare("SELECT media_id FROM media_files WHERE user_id = ? AND project_id = ?").all(userId, projectId);
    for (const { media_id: mediaId } of files) {
        if (used.has(mediaId)) continue;
        db.prepare("DELETE FROM media_files WHERE user_id = ? AND project_id = ? AND media_id = ?").run(userId, projectId, mediaId);
        await fs.promises.rm(mediaPath(userId, projectId, mediaId), { force: true });
    }
}

export function workRouter({ requireAuth }) {
    const router = express.Router();
    router.use(requireAuth);

    // Projects the user has saved work for, most recently changed first
    router.get("/", (req, res) => {
        const work = db.prepare(`
            SELECT w.project_id AS projectId, w.updated_at AS updatedAt, s.submitted_at AS submittedAt,
                   s.status AS status, s.mark AS mark
            FROM project_work w
            LEFT JOIN submissions s ON s.user_id = w.user_id AND s.project_id = w.project_id
            WHERE w.user_id = ? ORDER BY w.updated_at DESC
        `).all(req.user.id);
        res.json({ work });
    });

    router.param("projectId", (req, res, next, id) =>
        PROJECT_ID.test(id) ? next() : res.status(400).json({ error: "bad_request" }));

    router.get("/:projectId", (req, res) => {
        const submission = readSubmission(req.user.id, req.params.projectId);
        res.json({
            ...readWork(req.user.id, req.params.projectId),
            submission: submission && { ...submission, work: undefined },
            history: readSubmissionHistory(req.user.id, req.params.projectId),
        });
    });

    // Hands in the work as saved at `version` (the browser saves first); the student keeps working on
    // their own copy either way. An approved hand-in is final, until the teacher returns it. Handing in
    // again replaces the earlier copy; one the teacher already reviewed is kept with its feedback and mark
    // in the history, and the new one starts without, so a mark never stands next to work it wasn't for.
    router.post("/:projectId/submit", express.json({ limit: "10kb" }), wrap(async (req, res) => {
        const { projectId } = req.params;
        if (req.user.role !== "student") return res.status(403).json({ error: "forbidden" });
        if (!publishedToStudent(req.user.id, projectId)) return res.status(404).json({ error: "not_published" });
        const version = req.body?.version;
        const result = db.transaction(() => {
            const current = readWork(req.user.id, projectId);
            if (!current.work) return { error: "no_work" };
            if (current.version !== version) return { error: "conflict" };
            const earlier = db.prepare("SELECT status, reviewed_at FROM submissions WHERE user_id = ? AND project_id = ?")
                .get(req.user.id, projectId);
            if (earlier?.status === "approved") return { error: "already_approved" };
            const now = Date.now();
            if (earlier && earlier.reviewed_at !== null) {
                db.prepare(`
                    INSERT INTO submission_history (user_id, project_id, data, work_version, submitted_at, status, feedback,
                                                    mark, reviewed_at, reviewed_by, replaced_at)
                    SELECT user_id, project_id, data, work_version, submitted_at, status, feedback, mark, reviewed_at, reviewed_by, ?
                    FROM submissions WHERE user_id = ? AND project_id = ?
                `).run(now, req.user.id, projectId);
            }
            db.prepare(`
                INSERT INTO submissions (user_id, project_id, data, work_version, submitted_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (user_id, project_id)
                DO UPDATE SET data = excluded.data, work_version = excluded.work_version, submitted_at = excluded.submitted_at,
                              status = 'handed_in', feedback = '', mark = NULL, reviewed_at = NULL, reviewed_by = NULL
            `).run(req.user.id, projectId, JSON.stringify(current.work), current.version, now);
            return {};
        })();
        if (result.error) return res.status(result.error === "no_work" ? 400 : 409).json({ error: result.error });
        await pruneMedia(req.user.id, projectId);
        res.json({
            submission: { ...readSubmission(req.user.id, projectId), work: undefined },
            history: readSubmissionHistory(req.user.id, projectId),
        });
    }));

    // Takes the hand-in back, as long as the teacher hasn't given feedback on it (that would go with it).
    // When it replaced a hand-in the teacher had reviewed, that one is the hand-in again.
    router.delete("/:projectId/submission", wrap(async (req, res) => {
        const { projectId } = req.params;
        const result = db.transaction(() => {
            const current = db.prepare("SELECT reviewed_at FROM submissions WHERE user_id = ? AND project_id = ?")
                .get(req.user.id, projectId);
            if (current?.reviewed_at) return { error: "already_reviewed" };
            const { changes } = db.prepare("DELETE FROM submissions WHERE user_id = ? AND project_id = ?").run(req.user.id, projectId);
            const previous = changes > 0 && db.prepare(`
                SELECT rowid, * FROM submission_history WHERE user_id = ? AND project_id = ? ORDER BY submitted_at DESC LIMIT 1
            `).get(req.user.id, projectId);
            if (previous) {
                db.prepare(`
                    INSERT INTO submissions (user_id, project_id, data, work_version, submitted_at, status, feedback, mark, reviewed_at, reviewed_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(previous.user_id, previous.project_id, previous.data, previous.work_version, previous.submitted_at,
                    previous.status, previous.feedback, previous.mark, previous.reviewed_at, previous.reviewed_by);
                db.prepare("DELETE FROM submission_history WHERE rowid = ?").run(previous.rowid);
            }
            return {};
        })();
        if (result.error) return res.status(409).json({ error: result.error });
        await pruneMedia(req.user.id, projectId);
        const submission = readSubmission(req.user.id, projectId);
        res.json({ submission: submission && { ...submission, work: undefined }, history: readSubmissionHistory(req.user.id, projectId) });
    }));

    // Saves on top of `version`, the version this browser last loaded or saved. If the work was
    // saved elsewhere since (another tab or device), nothing changes and the newer work comes back.
    // Only for projects the user can open, and within the account's storage for saved work.
    router.put("/:projectId", express.json({ limit: "2mb" }), (req, res) => {
        const { projectId } = req.params;
        const { work, version } = req.body ?? {};
        if (!work || typeof work !== "object" || Array.isArray(work) || !Number.isSafeInteger(version)) {
            return res.status(400).json({ error: "bad_request" });
        }
        if (!canOpenProject(req.user, projectId)) return res.status(404).json({ error: "not_found" });
        const data = JSON.stringify(work);
        const { used } = db.prepare(`
            SELECT COALESCE(SUM(LENGTH(CAST(data AS BLOB))), 0) AS used FROM project_work WHERE user_id = ? AND project_id != ?
        `).get(req.user.id, projectId);
        if (used + Buffer.byteLength(data) > WORK_QUOTA) return res.status(413).json({ error: "storage_full" });
        const result = db.transaction(() => {
            const current = readWork(req.user.id, projectId);
            if (current.version !== version) return { conflict: current };
            const now = Date.now();
            db.prepare(`
                INSERT INTO project_work (user_id, project_id, data, version, updated_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (user_id, project_id)
                DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = excluded.updated_at
            `).run(req.user.id, projectId, data, version + 1, now);
            return { version: version + 1, updatedAt: now };
        })();
        if (result.conflict) return res.status(409).json({ error: "conflict", ...result.conflict });
        res.json(result);
    });

    return router;
}

export function mediaRouter({ requireAuth }) {
    const router = express.Router();
    router.use(requireAuth);

    router.param("projectId", (req, res, next, id) =>
        PROJECT_ID.test(id) ? next() : res.status(400).json({ error: "bad_request" }));
    router.param("mediaId", (req, res, next, id) =>
        MEDIA_ID.test(id) ? next() : res.status(400).json({ error: "bad_request" }));

    // Files are the signed-in user's own. A teacher can also read a student's (?user=), but only for an
    // assignment published (now or earlier) to a class in which they teach that student: not files of the
    // student's own assignments, or of assignments in other teachers' classes.
    function ownerFor(req) {
        if (req.query.user === undefined) return req.user.id;
        const userId = Number(req.query.user);
        if (userId === req.user.id) return userId;
        if (req.user.role !== "teacher" || !Number.isSafeInteger(userId)) return null;
        const allowed = db.prepare(`
            SELECT 1 FROM project_classes pc
            JOIN class_teachers t ON t.class_id = pc.class_id AND t.user_id = ?
            JOIN class_students s ON s.class_id = pc.class_id AND s.user_id = ?
            WHERE pc.project_id = ?
        `).get(req.user.id, userId, req.params.projectId);
        return allowed ? userId : null;
    }

    const findFile = (userId, { projectId, mediaId }) =>
        db.prepare("SELECT mime, size FROM media_files WHERE user_id = ? AND project_id = ? AND media_id = ?")
            .get(userId, projectId, mediaId);

    router.get("/:projectId/:mediaId", (req, res) => {
        const userId = ownerFor(req);
        const file = userId !== null && findFile(userId, req.params);
        if (!file) return res.status(404).json({ error: "not_found" });
        sendMedia(res, mediaPath(userId, req.params.projectId, req.params.mediaId), file.mime);
    });

    // The request body is the file itself, streamed to disk; only for projects the user can open
    router.put("/:projectId/:mediaId", wrap(async (req, res) => {
        const { projectId, mediaId } = req.params;
        if (!canOpenProject(req.user, projectId)) return res.status(404).json({ error: "not_found" });
        const mime = requestMime(req);
        if (!allowedType(mime)) return res.status(415).json({ error: "unsupported_media" });

        const { used } = db.prepare(`
            SELECT COALESCE(SUM(size), 0) AS used FROM media_files
            WHERE user_id = ? AND NOT (project_id = ? AND media_id = ?)
        `).get(req.user.id, projectId, mediaId);
        const limit = Math.min(MAX_FILE, QUOTA - used);
        const declared = Number(req.get("content-length"));
        const tooBig = limit === MAX_FILE ? "file_too_large" : "storage_full";
        if (limit <= 0 || declared > limit) return res.status(413).json({ error: tooBig });

        const size = await storeUpload(req, mediaPath(req.user.id, projectId, mediaId), limit);
        if (size === null) return res.status(413).set("Connection", "close").json({ error: tooBig });

        db.prepare(`
            INSERT INTO media_files (user_id, project_id, media_id, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (user_id, project_id, media_id) DO UPDATE SET mime = excluded.mime, size = excluded.size
        `).run(req.user.id, projectId, mediaId, mime, size, Date.now());
        res.status(201).json({ size });
    }));

    // A file a handed-in copy of the work uses stays until that's replaced or taken back
    router.delete("/:projectId/:mediaId", wrap(async (req, res) => {
        const { projectId, mediaId } = req.params;
        if (handedInMediaIds(req.user.id, projectId).has(mediaId)) return res.json({ ok: true });
        db.prepare("DELETE FROM media_files WHERE user_id = ? AND project_id = ? AND media_id = ?")
            .run(req.user.id, projectId, mediaId);
        await fs.promises.rm(mediaPath(req.user.id, projectId, mediaId), { force: true });
        res.json({ ok: true });
    }));

    return router;
}
