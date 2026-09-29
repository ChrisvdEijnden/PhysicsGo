import express from "express";
import db from "./db.js";
import { generateCode, normalizeCode } from "./codes.js";

const MAX_CLASS_NAME = 60;
const str = (v) => (typeof v === "string" ? v : "");

// Resolves an enrollment code. Teacher invitations share the code space but are only
// accepted at registration, so they're reported separately from class codes.
export function lookupCode(raw) {
    const code = normalizeCode(raw);
    if (!code) return { error: "invalid_code" };

    const cls = db.prepare("SELECT id, name, join_open FROM classes WHERE code = ?").get(code);
    if (cls) return cls.join_open ? { kind: "class", class: { id: cls.id, name: cls.name } } : { error: "class_closed" };

    if (db.prepare("SELECT 1 FROM retired_class_codes WHERE code = ?").get(code)) return { error: "code_expired" };

    const invite = db.prepare("SELECT uses_left FROM teacher_invites WHERE code = ?").get(code);
    if (invite) return invite.uses_left > 0 ? { kind: "teacher", code } : { error: "code_expired" };

    return { error: "invalid_code" };
}

export function classesOf(user) {
    const table = user.role === "teacher" ? "class_teachers" : "class_students";
    return db.prepare(`
        SELECT c.id, c.name FROM ${table} m JOIN classes c ON c.id = m.class_id
        WHERE m.user_id = ? ORDER BY c.name COLLATE NOCASE
    `).all(user.id);
}

function validName(v) {
    const name = str(v).trim();
    return name && name.length <= MAX_CLASS_NAME ? name : null;
}

function classDetail(classId, viewerId) {
    const c = db.prepare("SELECT * FROM classes WHERE id = ?").get(classId);
    const students = db.prepare(`
        SELECT u.id, u.name, u.email, s.joined_at AS joinedAt
        FROM class_students s JOIN users u ON u.id = s.user_id
        WHERE s.class_id = ? ORDER BY u.name COLLATE NOCASE
    `).all(classId);
    const teachers = db.prepare(`
        SELECT u.id, u.name, u.email
        FROM class_teachers t JOIN users u ON u.id = t.user_id
        WHERE t.class_id = ? ORDER BY t.added_at
    `).all(classId).map((t) => ({ ...t, isYou: t.id === viewerId }));

    return {
        id: c.id,
        name: c.name,
        code: c.code,
        joinOpen: Boolean(c.join_open),
        createdAt: c.created_at,
        students,
        teachers,
    };
}

export function classesRouter({ requireAuth, joinLimiter, publicUser }) {
    const router = express.Router();
    router.use(requireAuth);

    // Students: enroll in a class with the code their teacher shared
    router.post("/join", joinLimiter, (req, res) => {
        if (req.user.role !== "student") return res.status(403).json({ error: "teachers_cannot_join" });

        const found = lookupCode(req.body?.code);
        if (found.error) return res.status(400).json({ error: found.error });
        if (found.kind !== "class") return res.status(400).json({ error: "invalid_code" });

        const info = db.prepare(
            "INSERT OR IGNORE INTO class_students (class_id, user_id, joined_at) VALUES (?, ?, ?)"
        ).run(found.class.id, req.user.id, Date.now());
        if (info.changes === 0) return res.status(409).json({ error: "already_member" });

        res.status(201).json({ class: found.class, user: publicUser(req.user) });
    });

    // Everything below manages classes and is for teachers only
    router.use((req, res, next) => {
        if (req.user.role !== "teacher") return res.status(403).json({ error: "forbidden" });
        next();
    });

    // Only teachers of the class may see or change it; others get a 404 so ids don't leak
    router.param("classId", (req, res, next, raw) => {
        const id = Number(raw);
        const isTeacher = Number.isSafeInteger(id) &&
            db.prepare("SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ?").get(id, req.user.id);
        if (!isTeacher) return res.status(404).json({ error: "not_found" });
        req.classId = id;
        next();
    });

    router.get("/", (req, res) => {
        const classes = db.prepare(`
            SELECT c.id, c.name, c.code, c.join_open AS joinOpen,
                   (SELECT COUNT(*) FROM class_students s WHERE s.class_id = c.id) AS studentCount,
                   (SELECT COUNT(*) FROM class_teachers t WHERE t.class_id = c.id) AS teacherCount
            FROM class_teachers m JOIN classes c ON c.id = m.class_id
            WHERE m.user_id = ? ORDER BY c.name COLLATE NOCASE
        `).all(req.user.id).map((c) => ({ ...c, joinOpen: Boolean(c.joinOpen) }));
        res.json({ classes });
    });

    router.post("/", (req, res) => {
        const name = validName(req.body?.name);
        if (!name) return res.status(400).json({ error: "invalid_class_name" });

        const id = db.transaction(() => {
            const now = Date.now();
            const info = db.prepare("INSERT INTO classes (name, code, created_at) VALUES (?, ?, ?)")
                .run(name, generateCode(), now);
            db.prepare("INSERT INTO class_teachers (class_id, user_id, added_at) VALUES (?, ?, ?)")
                .run(info.lastInsertRowid, req.user.id, now);
            return Number(info.lastInsertRowid);
        })();
        res.status(201).json({ class: classDetail(id, req.user.id) });
    });

    router.get("/:classId", (req, res) => {
        res.json({ class: classDetail(req.classId, req.user.id) });
    });

    router.patch("/:classId", (req, res) => {
        const body = req.body ?? {};
        if ("name" in body) {
            const name = validName(body.name);
            if (!name) return res.status(400).json({ error: "invalid_class_name" });
            db.prepare("UPDATE classes SET name = ? WHERE id = ?").run(name, req.classId);
        }
        if ("joinOpen" in body) {
            if (typeof body.joinOpen !== "boolean") return res.status(400).json({ error: "bad_request" });
            db.prepare("UPDATE classes SET join_open = ? WHERE id = ?").run(body.joinOpen ? 1 : 0, req.classId);
        }
        res.json({ class: classDetail(req.classId, req.user.id) });
    });

    router.delete("/:classId", (req, res) => {
        db.prepare("DELETE FROM classes WHERE id = ?").run(req.classId);
        res.json({ ok: true });
    });

    // Issue a new code; the old one stops working and reports "expired" from then on
    router.post("/:classId/code", (req, res) => {
        db.transaction(() => {
            const { code } = db.prepare("SELECT code FROM classes WHERE id = ?").get(req.classId);
            db.prepare("INSERT INTO retired_class_codes (code, class_id) VALUES (?, ?)").run(code, req.classId);
            db.prepare("UPDATE classes SET code = ? WHERE id = ?").run(generateCode(), req.classId);
        })();
        res.json({ class: classDetail(req.classId, req.user.id) });
    });

    // Idempotent, so a second teacher removing the same student just sees the current list
    router.delete("/:classId/students/:userId", (req, res) => {
        db.prepare("DELETE FROM class_students WHERE class_id = ? AND user_id = ?")
            .run(req.classId, Number(req.params.userId));
        res.json({ class: classDetail(req.classId, req.user.id) });
    });

    // Co-teachers see the class, its students and (later) its submissions
    router.post("/:classId/teachers", (req, res) => {
        const email = str(req.body?.email).trim().toLowerCase();
        const teacher = db.prepare("SELECT id, role FROM users WHERE email = ?").get(email);
        if (!teacher) return res.status(404).json({ error: "user_not_found" });
        if (teacher.role !== "teacher") return res.status(400).json({ error: "not_a_teacher" });

        const info = db.prepare(
            "INSERT OR IGNORE INTO class_teachers (class_id, user_id, added_at) VALUES (?, ?, ?)"
        ).run(req.classId, teacher.id, Date.now());
        if (info.changes === 0) return res.status(409).json({ error: "already_teacher" });
        res.status(201).json({ class: classDetail(req.classId, req.user.id) });
    });

    // Removing yourself is how a teacher leaves a class
    router.delete("/:classId/teachers/:userId", (req, res) => {
        const userId = Number(req.params.userId);
        const result = db.transaction(() => {
            const { n } = db.prepare("SELECT COUNT(*) AS n FROM class_teachers WHERE class_id = ?").get(req.classId);
            const isMember = db.prepare("SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ?")
                .get(req.classId, userId);
            if (!isMember) return null;
            if (n <= 1) return "last_teacher";
            db.prepare("DELETE FROM class_teachers WHERE class_id = ? AND user_id = ?").run(req.classId, userId);
            return null;
        })();

        if (result === "last_teacher") return res.status(409).json({ error: result });
        if (userId === req.user.id) return res.json({ left: true });
        res.json({ class: classDetail(req.classId, req.user.id) });
    });

    return router;
}
