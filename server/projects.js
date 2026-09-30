import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import db from "./db.js";
import { MAX_FILE, MEDIA_ID, allowedType, projectMediaDir, projectMediaPath, requestMime, sendMedia, storeUpload, userMediaDir } from "./media.js";

// Built-in presets have readable ids ("standard-freefall"), teachers' projects random ones ("p-…")
export const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;

const str = (v) => (typeof v === "string" ? v : "");
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// Starter media per project: with a graph that's the most panels the modeling page shows
const MAX_PROJECT_MEDIA = 2;
const CATEGORIES = new Set(["photo", "video", "animation", "document"]);

// A website as starter media: any https address of another site (the app shows it in a sandboxed
// frame, and checks the address again before it does)
function validHref(value, req) {
    if (typeof value !== "string" || value.length > 2000) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password || url.host === req.get("host")) return null;
        return url.href;
    } catch {
        return null;
    }
}
// Students' own assignments per account, so one account can't fill the database
const MAX_OWN_PROJECTS = 100;

const projectMedia = (projectId) => db.prepare(`
    SELECT media_id AS id, name, mime, category, href FROM project_media WHERE project_id = ? ORDER BY created_at
`).all(projectId).map(({ href, ...m }) => (href ? { ...m, href } : m));

// A class's settings for an assignment published to it: instructions for that class, when it opens
// (students don't see it before) and when it's due; times in ms or null. Null when invalid.
function assignmentSettings(value) {
    if (!value || typeof value !== "object") return null;
    const { instructions = "", opensAt = null, dueAt = null } = value;
    const time = (v) => v === null || (Number.isSafeInteger(v) && v > 0);
    if (typeof instructions !== "string" || instructions.length > 5000 || !time(opensAt) || !time(dueAt)) return null;
    if (opensAt !== null && dueAt !== null && opensAt >= dueAt) return null;
    return { instructions: instructions.trim(), opensAt, dueAt };
}

// The classes the user belongs to (as teacher or student) that the project is published to, with each
// class's instructions, opening time and due date. Archived classes are left out (their publications
// come back if the class is restored), and students don't see an assignment before it opens.
function publishedClasses(user) {
    const teacher = user.role === "teacher";
    const rows = db.prepare(`
        SELECT pc.project_id AS projectId, c.id, c.name, pc.instructions, pc.opens_at AS opensAt, pc.due_at AS dueAt
        FROM project_classes pc
        JOIN classes c ON c.id = pc.class_id AND c.archived_at IS NULL
        JOIN ${teacher ? "class_teachers" : "class_students"} m ON m.class_id = c.id AND m.user_id = ?
        WHERE ? OR pc.opens_at IS NULL OR pc.opens_at <= ?
        ORDER BY c.name COLLATE NOCASE
    `).all(user.id, teacher ? 1 : 0, Date.now());

    const published = {};
    for (const { projectId, ...publication } of rows) (published[projectId] ??= []).push(publication);
    return published;
}

// A project as the app uses it
function toProject(row, viewerId) {
    return {
        id: row.id,
        title: row.title,
        explanation: row.explanation,
        start: row.start,
        model: row.model,
        estimatedTime: row.estimated_time,
        equipment: JSON.parse(row.equipment),
        graphs: JSON.parse(row.graphs),
        curriculum: Boolean(row.curriculum),
        builtIn: Boolean(row.built_in),
        mine: row.author_id !== null && row.author_id === viewerId,
        media: projectMedia(row.id),
        updatedAt: row.updated_at,
    };
}

// Teachers see the built-in presets, their own projects and those published to classes they teach;
// students see what's published to their classes and the assignments they made themselves
function visibleProjects(user) {
    const rows = user.role === "teacher"
        ? db.prepare(`
            SELECT p.* FROM projects p
            WHERE p.built_in = 1 OR p.author_id = ? OR EXISTS (
                SELECT 1 FROM project_classes pc JOIN class_teachers t ON t.class_id = pc.class_id
                WHERE pc.project_id = p.id AND t.user_id = ?)
            ORDER BY p.title COLLATE NOCASE
        `).all(user.id, user.id)
        : db.prepare(`
            SELECT p.* FROM projects p
            WHERE p.author_id = ? OR EXISTS (
                SELECT 1 FROM project_classes pc
                JOIN class_students s ON s.class_id = pc.class_id
                JOIN classes c ON c.id = pc.class_id AND c.archived_at IS NULL
                WHERE pc.project_id = p.id AND s.user_id = ? AND (pc.opens_at IS NULL OR pc.opens_at <= ?))
            ORDER BY p.title COLLATE NOCASE
        `).all(user.id, user.id, Date.now());
    return rows.map((row) => toProject(row, user.id));
}

// A project's fields from a request (column names); with `partial`, only those present. Null when invalid.
function projectFields(body, partial) {
    const fields = {};
    const has = (key) => !partial || key in body;
    if (has("title")) {
        const title = str(body.title).trim();
        if (!title || title.length > 100) return null;
        fields.title = title;
    }
    if (has("explanation")) {
        const v = body.explanation ?? "";
        if (typeof v !== "string" || v.length > 20000) return null;
        fields.explanation = v;
    }
    for (const key of ["start", "model"]) {
        if (!has(key)) continue;
        const v = body[key] ?? null;
        if (v !== null && (typeof v !== "string" || v.length > 20000)) return null;
        fields[key] = v;
    }
    if (has("estimatedTime")) {
        const v = body.estimatedTime ?? null;
        if (v !== null && !(Number.isInteger(v) && v > 0 && v <= 600)) return null;
        fields.estimated_time = v;
    }
    if (has("equipment")) {
        const v = body.equipment ?? [];
        if (!Array.isArray(v) || v.length > 30 || !v.every((x) => typeof x === "string" && x.trim() && x.length <= 100)) {
            return null;
        }
        fields.equipment = JSON.stringify(v.map((x) => x.trim()));
    }
    // The graphs students start with: [{ x: "t", ys: ["h", "v"] }]
    if ("graphs" in body) {
        const name = (n) => typeof n === "string" && n.length <= 50;
        const v = body.graphs ?? [];
        if (!Array.isArray(v) || v.length > 3
            || !v.every((g) => g && name(g.x) && Array.isArray(g.ys) && g.ys.length <= 6 && g.ys.every(name))) {
            return null;
        }
        fields.graphs = JSON.stringify(v.map((g) => ({ x: g.x, ys: g.ys })));
    }
    return fields;
}

export function projectsRouter({ requireAuth }) {
    const router = express.Router();
    router.use(requireAuth);
    // Explanations can be long, so this router has its own body limit (index.js skips the small one)
    router.use(express.json({ limit: "200kb" }));

    router.get("/", (req, res) => {
        res.json({ projects: visibleProjects(req.user) });
    });

    // { published: { [projectId]: [{ id, name }] } }, limited to the user's own classes:
    // students see what their classes got, teachers what they (and co-teachers) published
    router.get("/published", (req, res) => {
        res.json({ published: publishedClasses(req.user) });
    });

    // A new project. Teachers write them for their classes, and `copyOf` (a project the teacher can see)
    // also copies that project's starter media. Students make their own, which only they see and can't publish.
    router.post("/", wrap(async (req, res) => {
        const teacher = req.user.role === "teacher";
        if (!teacher) {
            const { count } = db.prepare("SELECT COUNT(*) AS count FROM projects WHERE author_id = ?").get(req.user.id);
            if (count >= MAX_OWN_PROJECTS) return res.status(400).json({ error: "too_many_projects" });
        }
        const fields = projectFields(req.body ?? {}, false);
        if (!fields) return res.status(400).json({ error: "invalid_project" });
        const copyOf = teacher && typeof req.body.copyOf === "string" && visibleProjects(req.user).find((p) => p.id === req.body.copyOf);
        const id = `p-${crypto.randomBytes(6).toString("hex")}`;
        const now = Date.now();
        // A copy starts with the same graphs unless others are given
        const graphs = fields.graphs ?? (copyOf ? JSON.stringify(copyOf.graphs) : "[]");
        db.prepare(`
            INSERT INTO projects (id, author_id, title, explanation, start, model, estimated_time, equipment, graphs, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, req.user.id, fields.title, fields.explanation, fields.start, fields.model,
            fields.estimated_time, fields.equipment, graphs, now, now);
        for (const m of copyOf ? copyOf.media : []) {
            const source = db.prepare("SELECT * FROM project_media WHERE project_id = ? AND media_id = ?").get(copyOf.id, m.id);
            // Websites have no file to copy
            if (!source.href) {
                await fs.promises.mkdir(projectMediaDir(id), { recursive: true });
                await fs.promises.copyFile(projectMediaPath(copyOf.id, m.id), projectMediaPath(id, m.id));
            }
            db.prepare(`
                INSERT INTO project_media (project_id, media_id, name, mime, category, size, created_at, href) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, m.id, source.name, source.mime, source.category, source.size, now, source.href);
        }
        res.status(201).json({ project: toProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id), req.user.id) });
    }));

    router.param("projectId", (req, res, next, id) =>
        PROJECT_ID.test(id) ? next() : res.status(400).json({ error: "bad_request" }));

    // Only a project's author changes or deletes it; others get a 404 so ids don't leak
    const authored = (req) =>
        db.prepare("SELECT * FROM projects WHERE id = ? AND author_id = ?").get(req.params.projectId, req.user.id);

    router.patch("/:projectId", (req, res) => {
        if (!authored(req)) return res.status(404).json({ error: "not_found" });
        const fields = projectFields(req.body ?? {}, true);
        if (!fields) return res.status(400).json({ error: "invalid_project" });
        const columns = Object.keys(fields);
        if (columns.length > 0) {
            db.prepare(`UPDATE projects SET ${columns.map((c) => `${c} = @${c}`).join(", ")}, updated_at = @now WHERE id = @id`)
                .run({ ...fields, now: Date.now(), id: req.params.projectId });
        }
        res.json({ project: toProject(authored(req), req.user.id) });
    });

    // Deleting also unpublishes it and removes its starter media, and the author's own work on it (for a
    // student's own assignment, that's all of it). Other students' saved work stays in their accounts.
    router.delete("/:projectId", wrap(async (req, res) => {
        const { projectId } = req.params;
        if (!authored(req)) return res.status(404).json({ error: "not_found" });
        db.transaction(() => {
            db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
            for (const table of ["project_work", "media_files", "submissions"]) {
                db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND project_id = ?`).run(req.user.id, projectId);
            }
        })();
        await fs.promises.rm(projectMediaDir(projectId), { recursive: true, force: true });
        await fs.promises.rm(path.join(userMediaDir(req.user.id), projectId), { recursive: true, force: true });
        res.json({ ok: true });
    }));

    router.param("mediaId", (req, res, next, id) =>
        MEDIA_ID.test(id) ? next() : res.status(400).json({ error: "bad_request" }));

    // Starter media: anyone who can open the project can view it; its author adds and removes it
    router.get("/:projectId/media/:mediaId", (req, res) => {
        const { projectId, mediaId } = req.params;
        const file = visibleProjects(req.user).some((p) => p.id === projectId)
            && db.prepare("SELECT mime FROM project_media WHERE project_id = ? AND media_id = ? AND href IS NULL").get(projectId, mediaId);
        if (!file) return res.status(404).json({ error: "not_found" });
        sendMedia(res, projectMediaPath(projectId, mediaId), file.mime);
    });

    // The body is the file; ?name= is its file name and ?category= photo, video, animation or document.
    // Only teachers' projects have starter media (students add media to their work, within their quota).
    router.put("/:projectId/media/:mediaId", wrap(async (req, res) => {
        const { projectId, mediaId } = req.params;
        if (req.user.role !== "teacher" || !authored(req)) return res.status(404).json({ error: "not_found" });
        const mime = requestMime(req);
        const name = str(req.query.name).trim().slice(0, 200);
        const category = str(req.query.category);
        if (!allowedType(mime)) return res.status(415).json({ error: "unsupported_media" });
        if (!name || !CATEGORIES.has(category)) return res.status(400).json({ error: "bad_request" });
        const exists = db.prepare("SELECT 1 FROM project_media WHERE project_id = ? AND media_id = ?").get(projectId, mediaId);
        if (!exists && projectMedia(projectId).length >= MAX_PROJECT_MEDIA) return res.status(400).json({ error: "too_many_media" });
        if (Number(req.get("content-length")) > MAX_FILE) return res.status(413).json({ error: "file_too_large" });

        const size = await storeUpload(req, projectMediaPath(projectId, mediaId), MAX_FILE);
        if (size === null) return res.status(413).set("Connection", "close").json({ error: "file_too_large" });
        db.prepare(`
            INSERT INTO project_media (project_id, media_id, name, mime, category, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (project_id, media_id) DO UPDATE SET name = excluded.name, mime = excluded.mime,
                category = excluded.category, size = excluded.size
        `).run(projectId, mediaId, name, mime, category, size, Date.now());
        db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(Date.now(), projectId);
        res.status(201).json({ project: toProject(authored(req), req.user.id) });
    }));

    // A website as starter media: { href, name }. It counts towards the same limit as files.
    router.put("/:projectId/links/:mediaId", (req, res) => {
        const { projectId, mediaId } = req.params;
        if (req.user.role !== "teacher" || !authored(req)) return res.status(404).json({ error: "not_found" });
        const href = validHref(req.body?.href, req);
        const name = str(req.body?.name).trim().slice(0, 200);
        if (!href || !name) return res.status(400).json({ error: "invalid_link" });
        const exists = db.prepare("SELECT 1 FROM project_media WHERE project_id = ? AND media_id = ?").get(projectId, mediaId);
        if (exists) return res.status(409).json({ error: "bad_request" });
        if (projectMedia(projectId).length >= MAX_PROJECT_MEDIA) return res.status(400).json({ error: "too_many_media" });
        db.prepare(`
            INSERT INTO project_media (project_id, media_id, name, mime, category, size, created_at, href)
            VALUES (?, ?, ?, 'text/html', 'embed', 0, ?, ?)
        `).run(projectId, mediaId, name, Date.now(), href);
        db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(Date.now(), projectId);
        res.status(201).json({ project: toProject(authored(req), req.user.id) });
    });

    // Students who already started keep the media in their work, shown as missing from then on
    router.delete("/:projectId/media/:mediaId", wrap(async (req, res) => {
        const { projectId, mediaId } = req.params;
        if (!authored(req)) return res.status(404).json({ error: "not_found" });
        db.prepare("DELETE FROM project_media WHERE project_id = ? AND media_id = ?").run(projectId, mediaId);
        await fs.promises.rm(projectMediaPath(projectId, mediaId), { force: true });
        res.json({ project: toProject(authored(req), req.user.id) });
    }));

    // Teachers set which of their active classes a project is open to. Classes they don't teach,
    // and archived ones, are left alone, so co-teachers' other classes aren't affected.
    router.put("/:projectId/classes", (req, res) => {
        if (req.user.role !== "teacher") return res.status(403).json({ error: "forbidden" });

        const projectId = req.params.projectId;
        if (!visibleProjects(req.user).some((p) => p.id === projectId)) return res.status(404).json({ error: "not_found" });

        const classIds = req.body?.classIds;
        if (!Array.isArray(classIds) || !classIds.every(Number.isSafeInteger)) {
            return res.status(400).json({ error: "bad_request" });
        }

        const mine = new Set(db.prepare(`
            SELECT m.class_id FROM class_teachers m JOIN classes c ON c.id = m.class_id
            WHERE m.user_id = ? AND c.archived_at IS NULL
        `).all(req.user.id).map((r) => r.class_id));
        if (!classIds.every((id) => mine.has(id))) return res.status(404).json({ error: "not_found" });

        // Optional per class: { instructions, opensAt, dueAt }; classes left out keep what they have
        const settings = req.body?.settings ?? {};
        if (typeof settings !== "object" || Array.isArray(settings)) return res.status(400).json({ error: "bad_request" });
        const updates = [];
        for (const [key, value] of Object.entries(settings)) {
            const classId = Number(key);
            if (!classIds.includes(classId)) return res.status(400).json({ error: "bad_request" });
            const valid = assignmentSettings(value);
            if (!valid) return res.status(400).json({ error: "invalid_assignment" });
            updates.push([classId, valid]);
        }

        const wanted = new Set(classIds);
        db.transaction(() => {
            const add = db.prepare(`
                INSERT OR IGNORE INTO project_classes (project_id, class_id, published_by, published_at)
                VALUES (?, ?, ?, ?)
            `);
            const remove = db.prepare("DELETE FROM project_classes WHERE project_id = ? AND class_id = ?");
            const update = db.prepare(`
                UPDATE project_classes SET instructions = ?, opens_at = ?, due_at = ? WHERE project_id = ? AND class_id = ?
            `);
            const now = Date.now();
            for (const classId of mine) {
                if (wanted.has(classId)) add.run(projectId, classId, req.user.id, now);
                else remove.run(projectId, classId);
            }
            for (const [classId, { instructions, opensAt, dueAt }] of updates) {
                update.run(instructions, opensAt, dueAt, projectId, classId);
            }
        })();

        res.json({ classes: publishedClasses(req.user)[projectId] ?? [] });
    });

    return router;
}
