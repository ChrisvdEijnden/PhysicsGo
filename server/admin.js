import express from "express";
import db from "./db.js";
import { formatCode, generateCode, normalizeCode } from "./codes.js";
import { createReset } from "./resets.js";
import { classesOnlyTaughtBy, deleteAccount } from "./accounts.js";
import { listSchools, validSchoolName } from "./schools.js";
import { accountLabel, audit, auditEntries } from "./audit.js";

const DAY = 24 * 60 * 60 * 1000;
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// What an administrator sees of an account
function accountRow(u) {
    return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isAdmin: Boolean(u.is_admin),
        disabled: u.disabled_at !== null,
        createdAt: u.created_at,
        lastActiveAt: u.last_active_at,
        classes: u.classes ?? 0,
        school: u.school_id ? { id: u.school_id, name: u.school_name } : null,
    };
}

const ACCOUNT_SELECT = `
    SELECT u.*, sc.name AS school_name,
           (SELECT COUNT(*) FROM class_students s WHERE s.user_id = u.id)
         + (SELECT COUNT(*) FROM class_teachers t WHERE t.user_id = u.id) AS classes
    FROM users u LEFT JOIN schools sc ON sc.id = u.school_id
`;

function findAccount(id) {
    return db.prepare(`${ACCOUNT_SELECT} WHERE u.id = ?`).get(id);
}

function invites() {
    return db.prepare(`
        SELECT i.code, i.uses_left AS usesLeft, i.created_at AS createdAt, i.expires_at AS expiresAt, u.name AS createdBy,
               sc.name AS school
        FROM teacher_invites i LEFT JOIN users u ON u.id = i.created_by LEFT JOIN schools sc ON sc.id = i.school_id
        WHERE i.uses_left > 0 AND (i.expires_at IS NULL OR i.expires_at > ?)
        ORDER BY i.created_at DESC
    `).all(Date.now()).map((i) => ({ ...i, code: formatCode(i.code) }));
}

// Administrators: schools, teacher invitations (each for a school), and every account (search,
// school, roles, password resets, deactivating and deleting). The first administrator is made
// with make-admin.js on the server.
export function adminRouter({ requireAuth }) {
    const router = express.Router();
    router.use(requireAuth, (req, res, next) => (req.user.is_admin ? next() : res.status(403).json({ error: "forbidden" })));

    router.get("/schools", (req, res) => res.json({ schools: listSchools() }));

    router.post("/schools", (req, res) => {
        const name = validSchoolName(req.body?.name);
        if (!name) return res.status(400).json({ error: "bad_request" });
        if (db.prepare("SELECT 1 FROM schools WHERE name = ?").get(name)) return res.status(409).json({ error: "school_exists" });
        db.prepare("INSERT INTO schools (name, created_at) VALUES (?, ?)").run(name, Date.now());
        audit(req.user, "school.create", name);
        res.status(201).json({ schools: listSchools() });
    });

    router.patch("/schools/:id", (req, res) => {
        const id = Number(req.params.id);
        const name = validSchoolName(req.body?.name);
        if (!name) return res.status(400).json({ error: "bad_request" });
        const school = db.prepare("SELECT name FROM schools WHERE id = ?").get(id);
        if (!school) return res.status(404).json({ error: "not_found" });
        if (db.prepare("SELECT 1 FROM schools WHERE name = ? AND id != ?").get(name, id)) return res.status(409).json({ error: "school_exists" });
        db.prepare("UPDATE schools SET name = ? WHERE id = ?").run(name, id);
        if (name !== school.name) audit(req.user, "school.rename", name, { from: school.name });
        res.json({ schools: listSchools() });
    });

    // Only a school nobody (and no class or invitation) belongs to can be deleted
    router.delete("/schools/:id", (req, res) => {
        const school = listSchools().find((s) => s.id === Number(req.params.id));
        if (!school) return res.status(404).json({ error: "not_found" });
        if (school.teachers + school.students + school.classes + school.invites > 0) return res.status(409).json({ error: "school_in_use" });
        db.transaction(() => {
            // Used-up and expired invitations go with it
            db.prepare("DELETE FROM teacher_invites WHERE school_id = ?").run(school.id);
            db.prepare("DELETE FROM schools WHERE id = ?").run(school.id);
        })();
        audit(req.user, "school.delete", school.name);
        res.json({ schools: listSchools() });
    });

    router.get("/invites", (req, res) => res.json({ invites: invites() }));

    // A code for up to `uses` teachers of school `schoolId` to sign up with, valid for `days` days
    router.post("/invites", (req, res) => {
        const uses = req.body?.uses ?? 1;
        const days = req.body?.days ?? 14;
        const schoolId = Number(req.body?.schoolId);
        if (!Number.isInteger(uses) || uses < 1 || uses > 100 || !Number.isInteger(days) || days < 1 || days > 90) {
            return res.status(400).json({ error: "bad_request" });
        }
        const school = db.prepare("SELECT name FROM schools WHERE id = ?").get(schoolId);
        if (!school) return res.status(400).json({ error: "school_required" });
        const now = Date.now();
        const code = generateCode();
        db.prepare("INSERT INTO teacher_invites (code, uses_left, created_at, created_by, expires_at, school_id) VALUES (?, ?, ?, ?, ?, ?)")
            .run(code, uses, now, req.user.id, now + days * DAY, schoolId);
        audit(req.user, "invite.create", school.name, { uses, days });
        res.status(201).json({ code: formatCode(code), invites: invites() });
    });

    router.delete("/invites/:code", (req, res) => {
        const code = normalizeCode(req.params.code);
        const invite = db.prepare("SELECT sc.name AS school FROM teacher_invites i LEFT JOIN schools sc ON sc.id = i.school_id WHERE i.code = ?").get(code);
        db.prepare("DELETE FROM teacher_invites WHERE code = ?").run(code);
        if (invite) audit(req.user, "invite.revoke", invite.school);
        res.json({ invites: invites() });
    });

    // Accounts whose name or email contains `q` (all when empty), most recently active first
    router.get("/users", (req, res) => {
        const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
        const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        const rows = db.prepare(`
            ${ACCOUNT_SELECT}
            WHERE u.name LIKE @like ESCAPE '\\' OR u.email LIKE @like ESCAPE '\\' OR sc.name LIKE @like ESCAPE '\\'
            ORDER BY u.last_active_at DESC NULLS LAST, u.id DESC
            LIMIT 51
        `).all({ like });
        res.json({ users: rows.slice(0, 50).map(accountRow), more: rows.length > 50 });
    });

    // Changes an account's role, school, administrator rights or whether it can sign in.
    // Administrators can't change their own, so there's always one left who can undo a mistake.
    router.patch("/users/:id", (req, res) => {
        const user = findAccount(Number(req.params.id));
        if (!user) return res.status(404).json({ error: "not_found" });
        const { role, isAdmin, disabled, schoolId } = req.body ?? {};
        // Their own school is the one thing they can change: it doesn't take away anyone's rights
        if (user.id === req.user.id && (role !== undefined || isAdmin !== undefined || disabled !== undefined)) {
            return res.status(409).json({ error: "cannot_change_self" });
        }
        if ((role !== undefined && role !== "student" && role !== "teacher")
            || (isAdmin !== undefined && typeof isAdmin !== "boolean")
            || (disabled !== undefined && typeof disabled !== "boolean")
            || (schoolId !== undefined && !db.prepare("SELECT 1 FROM schools WHERE id = ?").get(schoolId))) {
            return res.status(400).json({ error: "bad_request" });
        }
        // Classes stay in their school, so an account moves to another one only once it's in none
        if (schoolId !== undefined && schoolId !== user.school_id && user.classes > 0) {
            return res.status(409).json({ error: "has_classes" });
        }
        // A teacher becoming a student first hands over the classes only they teach
        if (role === "student" && user.role === "teacher") {
            const alone = classesOnlyTaughtBy(user.id);
            if (alone.length > 0) return res.status(409).json({ error: "classes_need_teacher", classes: alone.map((c) => c.name) });
        }

        db.transaction(() => {
            if (role !== undefined && role !== user.role) {
                // Class memberships belong to the old role: a new teacher leaves the classes they were a
                // student in, a former teacher stops teaching the (co-taught) classes they taught
                if (role === "teacher") db.prepare("DELETE FROM class_students WHERE user_id = ?").run(user.id);
                else {
                    db.prepare("DELETE FROM class_teachers WHERE user_id = ?").run(user.id);
                    db.prepare("UPDATE classes SET owner_id = NULL WHERE owner_id = ?").run(user.id);
                }
                db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, user.id);
            }
            if (schoolId !== undefined) db.prepare("UPDATE users SET school_id = ? WHERE id = ?").run(schoolId, user.id);
            if (isAdmin !== undefined) db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(isAdmin ? 1 : 0, user.id);
            if (disabled !== undefined) {
                db.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(disabled ? Date.now() : null, user.id);
                // A deactivated account is signed out everywhere at once
                if (disabled) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
            }
            const label = accountLabel(user);
            if (role !== undefined && role !== user.role) audit(req.user, "user.role", label, { role });
            if (isAdmin !== undefined && isAdmin !== Boolean(user.is_admin)) audit(req.user, isAdmin ? "user.admin_on" : "user.admin_off", label);
            if (disabled !== undefined && disabled !== (user.disabled_at !== null)) audit(req.user, disabled ? "user.disable" : "user.enable", label);
            if (schoolId !== undefined && schoolId !== user.school_id) {
                audit(req.user, "user.school", label, { school: db.prepare("SELECT name FROM schools WHERE id = ?").get(schoolId).name });
            }
        })();
        res.json({ user: accountRow(findAccount(user.id)) });
    });

    // A one-time code to set a new password with ("Forgot your password?" on the sign-in page)
    router.post("/users/:id/reset", (req, res) => {
        const user = findAccount(Number(req.params.id));
        if (!user) return res.status(404).json({ error: "not_found" });
        const reset = createReset(user.id, req.user.id);
        audit(req.user, "user.reset", accountLabel(user));
        res.json(reset);
    });

    router.delete("/users/:id", wrap(async (req, res) => {
        const user = findAccount(Number(req.params.id));
        if (!user) return res.status(404).json({ error: "not_found" });
        if (user.id === req.user.id) return res.status(409).json({ error: "cannot_change_self" });
        const alone = classesOnlyTaughtBy(user.id);
        if (alone.length > 0) return res.status(409).json({ error: "classes_need_teacher", classes: alone.map((c) => c.name) });
        await deleteAccount(user.id);
        audit(req.user, "user.delete", accountLabel(user));
        res.json({ ok: true });
    }));

    // The latest entries of the audit log (audit.js), newest first
    router.get("/audit", (req, res) => res.json({ entries: auditEntries() }));

    return router;
}
