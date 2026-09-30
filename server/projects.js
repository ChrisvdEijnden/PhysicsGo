import express from "express";
import crypto from "node:crypto";
import db from "./db.js";

// Built-in presets have readable ids ("standard-freefall"), teachers' projects random ones ("p-…")
export const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;

const str = (v) => (typeof v === "string" ? v : "");

// The classes the user belongs to (as teacher or student) that the project is published to.
// Archived classes are left out; their publications come back if the class is restored.
function publishedClasses(user) {
    const table = user.role === "teacher" ? "class_teachers" : "class_students";
    const rows = db.prepare(`
        SELECT pc.project_id AS projectId, c.id, c.name
        FROM project_classes pc
        JOIN classes c ON c.id = pc.class_id AND c.archived_at IS NULL
        JOIN ${table} m ON m.class_id = c.id AND m.user_id = ?
        ORDER BY c.name COLLATE NOCASE
    `).all(user.id);

    const published = {};
    for (const { projectId, id, name } of rows) (published[projectId] ??= []).push({ id, name });
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
        curriculum: Boolean(row.curriculum),
        builtIn: Boolean(row.built_in),
        mine: row.author_id !== null && row.author_id === viewerId,
        updatedAt: row.updated_at,
    };
}

// Teachers see the built-in presets, their own projects and those published to classes they teach;
// students see what's published to their classes
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
            WHERE EXISTS (
                SELECT 1 FROM project_classes pc
                JOIN class_students s ON s.class_id = pc.class_id
                JOIN classes c ON c.id = pc.class_id AND c.archived_at IS NULL
                WHERE pc.project_id = p.id AND s.user_id = ?)
            ORDER BY p.title COLLATE NOCASE
        `).all(user.id);
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

    router.post("/", (req, res) => {
        if (req.user.role !== "teacher") return res.status(403).json({ error: "forbidden" });
        const fields = projectFields(req.body ?? {}, false);
        if (!fields) return res.status(400).json({ error: "invalid_project" });
        const id = `p-${crypto.randomBytes(6).toString("hex")}`;
        const now = Date.now();
        db.prepare(`
            INSERT INTO projects (id, author_id, title, explanation, start, model, estimated_time, equipment, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, req.user.id, fields.title, fields.explanation, fields.start, fields.model,
            fields.estimated_time, fields.equipment, now, now);
        res.status(201).json({ project: toProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id), req.user.id) });
    });

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

    // Deleting also unpublishes it; students' saved work stays in their accounts
    router.delete("/:projectId", (req, res) => {
        if (!authored(req)) return res.status(404).json({ error: "not_found" });
        db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.projectId);
        res.json({ ok: true });
    });

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

        const wanted = new Set(classIds);
        db.transaction(() => {
            const add = db.prepare(`
                INSERT OR IGNORE INTO project_classes (project_id, class_id, published_by, published_at)
                VALUES (?, ?, ?, ?)
            `);
            const remove = db.prepare("DELETE FROM project_classes WHERE project_id = ? AND class_id = ?");
            const now = Date.now();
            for (const classId of mine) {
                if (wanted.has(classId)) add.run(projectId, classId, req.user.id, now);
                else remove.run(projectId, classId);
            }
        })();

        res.json({ classes: publishedClasses(req.user)[projectId] ?? [] });
    });

    return router;
}
