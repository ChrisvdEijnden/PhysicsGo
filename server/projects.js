import express from "express";
import db from "./db.js";

// Project ids come from the app's project list, e.g. "standard-freefall"
const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;

// The classes the user belongs to (as teacher or student) that the project is published to
function publishedClasses(user) {
    const table = user.role === "teacher" ? "class_teachers" : "class_students";
    const rows = db.prepare(`
        SELECT pc.project_id AS projectId, c.id, c.name
        FROM project_classes pc
        JOIN classes c ON c.id = pc.class_id
        JOIN ${table} m ON m.class_id = c.id AND m.user_id = ?
        ORDER BY c.name COLLATE NOCASE
    `).all(user.id);

    const published = {};
    for (const { projectId, id, name } of rows) (published[projectId] ??= []).push({ id, name });
    return published;
}

export function projectsRouter({ requireAuth }) {
    const router = express.Router();
    router.use(requireAuth);

    // { published: { [projectId]: [{ id, name }] } }, limited to the user's own classes:
    // students see what their classes got, teachers what they (and co-teachers) published
    router.get("/published", (req, res) => {
        res.json({ published: publishedClasses(req.user) });
    });

    // Teachers set which of their classes a project is open to. Classes they don't teach
    // are left alone, so co-teachers' other classes aren't affected.
    router.put("/:projectId/classes", (req, res) => {
        if (req.user.role !== "teacher") return res.status(403).json({ error: "forbidden" });

        const projectId = req.params.projectId;
        if (!PROJECT_ID.test(projectId)) return res.status(400).json({ error: "bad_request" });

        const classIds = req.body?.classIds;
        if (!Array.isArray(classIds) || !classIds.every(Number.isSafeInteger)) {
            return res.status(400).json({ error: "bad_request" });
        }

        const mine = new Set(
            db.prepare("SELECT class_id FROM class_teachers WHERE user_id = ?").all(req.user.id).map((r) => r.class_id)
        );
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
