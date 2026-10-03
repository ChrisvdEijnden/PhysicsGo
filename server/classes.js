import express from "express";
import db from "./db.js";
import { generateCode, normalizeCode } from "./codes.js";
import { createReset } from "./resets.js";
import { deleteAccount } from "./accounts.js";
import { readSubmission, readSubmissionHistory, readWork } from "./work.js";
import { accountLabel, audit } from "./audit.js";

const MAX_CLASS_NAME = 60;
const EMAIL_RE = /^\S+@\S+\.\S+$/;
// A deleted class is archived: restorable this long, then removed for good
export const ARCHIVE_MS = 30 * 24 * 60 * 60 * 1000;
const str = (v) => (typeof v === "string" ? v : "");
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Owner of class `c`: its owner_id, or its longest-serving teacher if the owner's account is gone
const OWNER = `COALESCE(c.owner_id, (
    SELECT t.user_id FROM class_teachers t WHERE t.class_id = c.id ORDER BY t.added_at, t.user_id LIMIT 1
))`;

// Resolves an enrollment code. Teacher invitations share the code space but are only
// accepted at registration, so they're reported separately from class codes.
export function lookupCode(raw) {
    const code = normalizeCode(raw);
    if (!code) return { error: "invalid_code" };

    const cls = db.prepare("SELECT id, name, join_open, archived_at, school_id FROM classes WHERE code = ?").get(code);
    if (cls) {
        return cls.join_open && cls.archived_at === null
            ? { kind: "class", class: { id: cls.id, name: cls.name }, schoolId: cls.school_id }
            : { error: "class_closed" };
    }

    if (db.prepare("SELECT 1 FROM retired_class_codes WHERE code = ?").get(code)) return { error: "code_expired" };

    const invite = db.prepare("SELECT uses_left, expires_at, school_id FROM teacher_invites WHERE code = ?").get(code);
    if (invite) {
        const valid = invite.uses_left > 0 && (invite.expires_at === null || invite.expires_at > Date.now());
        return valid ? { kind: "teacher", code, schoolId: invite.school_id } : { error: "code_expired" };
    }

    return { error: "invalid_code" };
}

// The user's active classes; archived ones only show on the teachers' Classes page
export function classesOf(user) {
    const table = user.role === "teacher" ? "class_teachers" : "class_students";
    return db.prepare(`
        SELECT c.id, c.name FROM ${table} m JOIN classes c ON c.id = m.class_id
        WHERE m.user_id = ? AND c.archived_at IS NULL ORDER BY c.name COLLATE NOCASE
    `).all(user.id);
}

export function purgeArchivedClasses(now = Date.now()) {
    const due = db.prepare("SELECT id, name FROM classes WHERE archived_at IS NOT NULL AND archived_at <= ?").all(now - ARCHIVE_MS);
    for (const c of due) {
        db.prepare("DELETE FROM classes WHERE id = ?").run(c.id);
        audit(null, "class.purge", c.name);
    }
}

function validName(v) {
    const name = str(v).trim();
    return name && name.length <= MAX_CLASS_NAME ? name : null;
}

function classDetail(classId, viewerId) {
    const c = db.prepare(`SELECT c.*, ${OWNER} AS owner FROM classes c WHERE c.id = ?`).get(classId);
    const students = db.prepare(`
        SELECT u.id, u.name, u.email, s.joined_at AS joinedAt
        FROM class_students s JOIN users u ON u.id = s.user_id
        WHERE s.class_id = ? ORDER BY u.name COLLATE NOCASE
    `).all(classId);
    const teachers = db.prepare(`
        SELECT u.id, u.name, u.email
        FROM class_teachers t JOIN users u ON u.id = t.user_id
        WHERE t.class_id = ? ORDER BY t.added_at
    `).all(classId).map((t) => ({ ...t, isYou: t.id === viewerId, isOwner: t.id === c.owner }));
    const invites = db.prepare(`
        SELECT email, created_at AS createdAt FROM class_teacher_invites
        WHERE class_id = ? ORDER BY created_at
    `).all(classId);

    return {
        id: c.id,
        name: c.name,
        code: c.code,
        joinOpen: Boolean(c.join_open),
        createdAt: c.created_at,
        archivedAt: c.archived_at,
        purgeAt: c.archived_at === null ? null : c.archived_at + ARCHIVE_MS,
        youAreOwner: c.owner === viewerId,
        students,
        teachers,
        invites,
    };
}

// Classes the teacher has been invited to teach, by the email address of their account
function invitationsFor(user) {
    return db.prepare(`
        SELECT c.id, c.name, i.created_at AS invitedAt, u.name AS invitedBy
        FROM class_teacher_invites i
        JOIN classes c ON c.id = i.class_id
        LEFT JOIN users u ON u.id = i.invited_by
        WHERE i.email = ? AND c.archived_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM class_teachers t WHERE t.class_id = c.id AND t.user_id = ?)
          AND c.school_id IS ?
        ORDER BY i.created_at
    `).all(user.email, user.id, user.school_id ?? null);
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
        // Classes of another school can't be joined; a student without a school gets the class's
        if (req.user.school_id && found.schoolId && req.user.school_id !== found.schoolId) {
            return res.status(403).json({ error: "other_school" });
        }
        if (!req.user.school_id && found.schoolId) {
            db.prepare("UPDATE users SET school_id = ? WHERE id = ?").run(found.schoolId, req.user.id);
            req.user.school_id = found.schoolId;
        }

        const info = db.prepare(
            "INSERT OR IGNORE INTO class_students (class_id, user_id, joined_at) VALUES (?, ?, ?)"
        ).run(found.class.id, req.user.id, Date.now());
        if (info.changes === 0) return res.status(409).json({ error: "already_member" });

        res.status(201).json({ class: found.class, user: publicUser(req.user) });
    });

    // Students: their classes, each with its teachers and the assignments open to it so far
    router.get("/mine", (req, res) => {
        if (req.user.role !== "student") return res.status(403).json({ error: "forbidden" });
        const teachers = db.prepare(`
            SELECT u.name FROM class_teachers t JOIN users u ON u.id = t.user_id WHERE t.class_id = ? ORDER BY t.added_at
        `);
        const assignments = db.prepare(`
            SELECT p.id, p.title, pc.due_at AS dueAt FROM project_classes pc JOIN projects p ON p.id = pc.project_id
            WHERE pc.class_id = ? AND pc.unpublished_at IS NULL AND (pc.opens_at IS NULL OR pc.opens_at <= ?)
            ORDER BY pc.due_at IS NULL, pc.due_at, p.title COLLATE NOCASE
        `);
        const classes = db.prepare(`
            SELECT c.id, c.name, s.joined_at AS joinedAt FROM class_students s
            JOIN classes c ON c.id = s.class_id AND c.archived_at IS NULL
            WHERE s.user_id = ? ORDER BY c.name COLLATE NOCASE
        `).all(req.user.id);
        const now = Date.now();
        res.json({
            classes: classes.map((c) => ({
                ...c,
                teachers: teachers.all(c.id).map((t) => t.name),
                assignments: assignments.all(c.id, now),
            })),
        });
    });

    // Students: leave a class, e.g. one joined by mistake. Their work stays in their account, but the
    // class's teachers no longer see it, and assignments only that class had disappear from their list.
    router.delete("/mine/:studentClassId", (req, res) => {
        if (req.user.role !== "student") return res.status(403).json({ error: "forbidden" });
        const info = db.prepare("DELETE FROM class_students WHERE class_id = ? AND user_id = ?")
            .run(Number(req.params.studentClassId), req.user.id);
        if (info.changes === 0) return res.status(404).json({ error: "not_found" });
        res.json({ user: publicUser(req.user) });
    });

    // Everything below manages classes and is for teachers only
    router.use((req, res, next) => {
        if (req.user.role !== "teacher") return res.status(403).json({ error: "forbidden" });
        next();
    });

    router.get("/invitations", (req, res) => {
        res.json({ invitations: invitationsFor(req.user) });
    });

    router.post("/invitations/:inviteClassId/accept", (req, res) => {
        const classId = Number(req.params.inviteClassId);
        const accepted = db.transaction(() => {
            if (!invitationsFor(req.user).some((c) => c.id === classId)) return false;
            db.prepare("INSERT INTO class_teachers (class_id, user_id, added_at) VALUES (?, ?, ?)")
                .run(classId, req.user.id, Date.now());
            db.prepare("DELETE FROM class_teacher_invites WHERE class_id = ? AND email = ?").run(classId, req.user.email);
            return true;
        })();
        if (!accepted) return res.status(404).json({ error: "invite_not_found" });
        res.json({ invitations: invitationsFor(req.user), user: publicUser(req.user) });
    });

    router.post("/invitations/:inviteClassId/decline", (req, res) => {
        db.prepare("DELETE FROM class_teacher_invites WHERE class_id = ? AND email = ?")
            .run(Number(req.params.inviteClassId), req.user.email);
        res.json({ invitations: invitationsFor(req.user) });
    });

    // Only teachers of the class may see or change it; others get a 404 so ids don't leak
    router.param("classId", (req, res, next, raw) => {
        const id = Number(raw);
        const row = Number.isSafeInteger(id) && db.prepare(`
            SELECT c.name, c.archived_at, ${OWNER} AS owner
            FROM classes c JOIN class_teachers m ON m.class_id = c.id AND m.user_id = ?
            WHERE c.id = ?
        `).get(req.user.id, id);
        if (!row) return res.status(404).json({ error: "not_found" });
        req.classId = id;
        req.className = row.name;
        req.classArchived = row.archived_at !== null;
        req.isClassOwner = row.owner === req.user.id;
        next();
    });

    // An archived class can be viewed and restored, and teachers can leave it; nothing else
    const active = (req, res, next) =>
        req.classArchived ? res.status(409).json({ error: "class_archived" }) : next();
    const ownerOnly = (req, res, next) =>
        req.isClassOwner ? next() : res.status(403).json({ error: "owner_only" });

    router.get("/", (req, res) => {
        const classes = db.prepare(`
            SELECT c.id, c.name, c.code, c.join_open AS joinOpen, c.archived_at AS archivedAt,
                   ${OWNER} = m.user_id AS isOwner,
                   (SELECT COUNT(*) FROM class_students s WHERE s.class_id = c.id) AS studentCount,
                   (SELECT COUNT(*) FROM class_teachers t WHERE t.class_id = c.id) AS teacherCount
            FROM class_teachers m JOIN classes c ON c.id = m.class_id
            WHERE m.user_id = ? ORDER BY c.name COLLATE NOCASE
        `).all(req.user.id).map((c) => ({ ...c, joinOpen: Boolean(c.joinOpen), isOwner: Boolean(c.isOwner) }));
        res.json({ classes });
    });

    router.post("/", (req, res) => {
        const name = validName(req.body?.name);
        if (!name) return res.status(400).json({ error: "invalid_class_name" });

        const id = db.transaction(() => {
            const now = Date.now();
            // A class belongs to its teacher's school
            const info = db.prepare("INSERT INTO classes (name, code, owner_id, created_at, school_id) VALUES (?, ?, ?, ?, ?)")
                .run(name, generateCode(), req.user.id, now, req.user.school_id ?? null);
            db.prepare("INSERT INTO class_teachers (class_id, user_id, added_at) VALUES (?, ?, ?)")
                .run(info.lastInsertRowid, req.user.id, now);
            return Number(info.lastInsertRowid);
        })();
        res.status(201).json({ class: classDetail(id, req.user.id) });
    });

    // The latest hand-ins in the teacher's active classes, newest first, for the dashboard
    router.get("/hand-ins", (req, res) => {
        const handIns = db.prepare(`
            SELECT sub.user_id AS studentId, u.name AS studentName, sub.project_id AS projectId,
                   c.id AS classId, c.name AS className, sub.submitted_at AS submittedAt, pc.due_at AS dueAt,
                   sub.status AS status, sub.mark AS mark
            FROM submissions sub
            JOIN users u ON u.id = sub.user_id
            JOIN class_students s ON s.user_id = sub.user_id
            JOIN classes c ON c.id = s.class_id AND c.archived_at IS NULL
            JOIN class_teachers t ON t.class_id = c.id AND t.user_id = ?
            JOIN project_classes pc ON pc.class_id = c.id AND pc.project_id = sub.project_id
            ORDER BY sub.submitted_at DESC LIMIT 20
        `).all(req.user.id).map(({ dueAt, ...h }) => ({ ...h, late: dueAt !== null && h.submittedAt > dueAt }));
        res.json({ handIns });
    });

    router.get("/:classId", (req, res) => {
        res.json({ class: classDetail(req.classId, req.user.id) });
    });

    router.patch("/:classId", active, (req, res) => {
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

    // Deleting archives the class: students no longer see it or its projects and its code stops
    // working, but the owner can restore it until it's purged
    router.delete("/:classId", ownerOnly, active, (req, res) => {
        db.prepare("UPDATE classes SET archived_at = ? WHERE id = ?").run(Date.now(), req.classId);
        audit(req.user, "class.archive", req.className);
        res.json({ class: classDetail(req.classId, req.user.id) });
    });

    router.post("/:classId/restore", ownerOnly, (req, res) => {
        const { changes } = db.prepare("UPDATE classes SET archived_at = NULL WHERE id = ? AND archived_at IS NOT NULL").run(req.classId);
        if (changes > 0) audit(req.user, "class.restore", req.className);
        res.json({ class: classDetail(req.classId, req.user.id) });
    });

    // Issue a new code; the old one stops working and reports "expired" from then on
    router.post("/:classId/code", active, (req, res) => {
        db.transaction(() => {
            const { code } = db.prepare("SELECT code FROM classes WHERE id = ?").get(req.classId);
            db.prepare("INSERT INTO retired_class_codes (code, class_id) VALUES (?, ?)").run(code, req.classId);
            db.prepare("UPDATE classes SET code = ? WHERE id = ?").run(generateCode(), req.classId);
        })();
        res.json({ class: classDetail(req.classId, req.user.id) });
    });

    // Idempotent, so a second teacher removing the same student just sees the current list
    router.delete("/:classId/students/:userId", active, (req, res) => {
        const student = db.prepare("SELECT name, email FROM users WHERE id = ?").get(Number(req.params.userId));
        const { changes } = db.prepare("DELETE FROM class_students WHERE class_id = ? AND user_id = ?")
            .run(req.classId, Number(req.params.userId));
        if (changes > 0) audit(req.user, "class.remove_student", accountLabel(student), { class: req.className });
        res.json({ class: classDetail(req.classId, req.user.id) });
    });

    // A one-time code the student uses to choose a new password; an earlier code stops working
    router.post("/:classId/students/:userId/reset", active, (req, res) => {
        const userId = Number(req.params.userId);
        const inClass = db.prepare("SELECT 1 FROM class_students WHERE class_id = ? AND user_id = ?").get(req.classId, userId);
        if (!inClass) return res.status(404).json({ error: "student_not_found" });
        const reset = createReset(userId, req.user.id);
        audit(req.user, "class.reset_student", accountLabel(db.prepare("SELECT name, email FROM users WHERE id = ?").get(userId)), { class: req.className });
        res.status(201).json(reset);
    });

    // Deletes a student's account altogether (e.g. one who left school), with all their work. Only the
    // class's owner may, and only when every class the student is in is one they teach: work for other
    // teachers' classes isn't theirs to delete (they remove the student from their class, or ask an
    // administrator). The app asks for a confirmation in a dialog first.
    router.delete("/:classId/students/:userId/account", ownerOnly, active, wrap(async (req, res) => {
        const userId = Number(req.params.userId);
        const inClass = db.prepare("SELECT 1 FROM class_students WHERE class_id = ? AND user_id = ?").get(req.classId, userId);
        if (!inClass) return res.status(404).json({ error: "student_not_found" });
        const elsewhere = db.prepare(`
            SELECT c.name FROM class_students s JOIN classes c ON c.id = s.class_id
            WHERE s.user_id = ? AND NOT EXISTS (SELECT 1 FROM class_teachers t WHERE t.class_id = s.class_id AND t.user_id = ?)
            ORDER BY c.name COLLATE NOCASE
        `).all(userId, req.user.id);
        if (elsewhere.length > 0) {
            return res.status(409).json({ error: "student_in_other_classes", classes: elsewhere.map((c) => c.name) });
        }
        const label = accountLabel(db.prepare("SELECT name, email FROM users WHERE id = ?").get(userId));
        await deleteAccount(userId);
        audit(req.user, "class.delete_student", label, { class: req.className });
        res.json({ class: classDetail(req.classId, req.user.id) });
    }));

    // Per assignment in the class (with its due date), where each student is: not started, working,
    // or handed in, and whether that was after the due date. Assignments taken back from the class are
    // listed too (published: false), so their hand-ins and marks stay in view.
    router.get("/:classId/progress", (req, res) => {
        const projects = db.prepare(`
            SELECT project_id AS projectId, opens_at AS opensAt, due_at AS dueAt, unpublished_at IS NULL AS published
            FROM project_classes
            WHERE class_id = ? ORDER BY unpublished_at IS NOT NULL, due_at IS NULL, due_at, published_at
        `).all(req.classId);
        const rows = db.prepare(`
            SELECT u.id, u.name, w.updated_at AS updatedAt, sub.submitted_at AS submittedAt,
                   w.version AS version, sub.work_version AS submittedVersion, sub.status AS reviewStatus, sub.mark AS mark
            FROM class_students s JOIN users u ON u.id = s.user_id
            LEFT JOIN project_work w ON w.user_id = u.id AND w.project_id = ?
            LEFT JOIN submissions sub ON sub.user_id = u.id AND sub.project_id = ?
            WHERE s.class_id = ? ORDER BY u.name COLLATE NOCASE
        `);
        res.json({
            projects: projects.map(({ projectId, opensAt, dueAt, published }) => ({
                projectId,
                opensAt,
                dueAt,
                published: Boolean(published),
                students: rows.all(projectId, projectId, req.classId).map((r) => ({
                    id: r.id,
                    name: r.name,
                    // handed_in, returned (for revision) or approved once handed in
                    status: r.submittedAt ? r.reviewStatus : r.updatedAt ? "working" : "not_started",
                    mark: r.mark,
                    updatedAt: r.updatedAt,
                    submittedAt: r.submittedAt,
                    // Worked on after handing in
                    changedSince: Boolean(r.submittedAt && r.version > r.submittedVersion),
                    late: Boolean(r.submittedAt && dueAt !== null && r.submittedAt > dueAt),
                })),
            })),
        });
    });

    // A student's work on a project published to the class, and what they handed in, to view read-only
    router.get("/:classId/students/:userId/work/:projectId", (req, res) => {
        const userId = Number(req.params.userId);
        const { projectId } = req.params;
        const allowed = db.prepare(`
            SELECT u.name FROM class_students s JOIN users u ON u.id = s.user_id
            JOIN project_classes pc ON pc.class_id = s.class_id AND pc.project_id = ?
            WHERE s.class_id = ? AND s.user_id = ?
        `).get(projectId, req.classId, userId);
        if (!allowed) return res.status(404).json({ error: "student_not_found" });
        res.json({
            student: { id: userId, name: allowed.name },
            ...readWork(userId, projectId),
            submission: readSubmission(userId, projectId),
            // Earlier hand-ins the teacher had reviewed, with that feedback (without their work)
            history: readSubmissionHistory(userId, projectId),
        });
    });

    // The teacher's feedback on a hand-in: status (handed_in, returned for revision, approved), a comment
    // and an optional mark from 1.0 to 10.0. The student sees it with their assignment.
    router.put("/:classId/students/:userId/work/:projectId/feedback", active, (req, res) => {
        const userId = Number(req.params.userId);
        const { projectId } = req.params;
        const inClass = db.prepare(`
            SELECT 1 FROM class_students s JOIN project_classes pc ON pc.class_id = s.class_id AND pc.project_id = ?
            WHERE s.class_id = ? AND s.user_id = ?
        `).get(projectId, req.classId, userId);
        if (!inClass || !readSubmission(userId, projectId)) return res.status(404).json({ error: "not_found" });

        const { status, feedback = "", mark = null } = req.body ?? {};
        if (!["handed_in", "returned", "approved"].includes(status) || typeof feedback !== "string" || feedback.length > 5000
            || (mark !== null && !(typeof mark === "number" && mark >= 1 && mark <= 10))) {
            return res.status(400).json({ error: "bad_request" });
        }
        db.prepare(`
            UPDATE submissions SET status = ?, feedback = ?, mark = ?, reviewed_at = ?, reviewed_by = ?
            WHERE user_id = ? AND project_id = ?
        `).run(status, feedback.trim(), mark === null ? null : Math.round(mark * 10) / 10, Date.now(), req.user.id, userId, projectId);
        res.json({ submission: readSubmission(userId, projectId) });
    });

    // Co-teachers are invited by email and join by accepting. The answer is the same whether or
    // not the address has an account, so this can't be used to find out who uses PhysicsGo.
    router.post("/:classId/teachers", active, (req, res) => {
        const email = str(req.body?.email).trim().toLowerCase();
        if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: "invalid_email" });

        // Teachers of the class are listed on this page anyway, so saying so reveals nothing
        const teaches = db.prepare(`
            SELECT 1 FROM class_teachers t JOIN users u ON u.id = t.user_id WHERE t.class_id = ? AND u.email = ?
        `).get(req.classId, email);
        if (teaches) return res.status(409).json({ error: "already_teacher" });

        db.prepare(`
            INSERT OR IGNORE INTO class_teacher_invites (class_id, email, invited_by, created_at) VALUES (?, ?, ?, ?)
        `).run(req.classId, email, req.user.id, Date.now());
        res.status(201).json({ class: classDetail(req.classId, req.user.id) });
    });

    router.delete("/:classId/invites/:email", (req, res) => {
        db.prepare("DELETE FROM class_teacher_invites WHERE class_id = ? AND email = ?").run(req.classId, req.params.email);
        res.json({ class: classDetail(req.classId, req.user.id) });
    });

    // The owner hands the class over to one of its other teachers
    router.post("/:classId/owner", ownerOnly, active, (req, res) => {
        const userId = Number(req.body?.userId);
        const teaches = db.prepare("SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ?").get(req.classId, userId);
        if (!teaches) return res.status(400).json({ error: "bad_request" });
        db.prepare("UPDATE classes SET owner_id = ? WHERE id = ?").run(userId, req.classId);
        audit(req.user, "class.owner", accountLabel(db.prepare("SELECT name, email FROM users WHERE id = ?").get(userId)), { class: req.className });
        res.json({ class: classDetail(req.classId, req.user.id) });
    });

    // Any teacher can leave, except the owner, who hands the class over first.
    // Only the owner removes other teachers.
    router.delete("/:classId/teachers/:userId", (req, res) => {
        const userId = Number(req.params.userId);
        const leaving = userId === req.user.id;
        if (leaving && req.isClassOwner) return res.status(409).json({ error: "owner_cannot_leave" });
        if (!leaving && !req.isClassOwner) return res.status(403).json({ error: "owner_only" });

        const teacher = db.prepare("SELECT name, email FROM users WHERE id = ?").get(userId);
        const { changes } = db.prepare("DELETE FROM class_teachers WHERE class_id = ? AND user_id = ?").run(req.classId, userId);
        if (changes > 0) audit(req.user, leaving ? "class.leave" : "class.remove_teacher", leaving ? req.className : accountLabel(teacher), { class: req.className });
        if (leaving) return res.json({ left: true });
        res.json({ class: classDetail(req.classId, req.user.id) });
    });

    return router;
}
