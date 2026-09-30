import express from "express";
import db from "./db.js";
import { formatCode, generateCode, normalizeCode } from "./codes.js";
import { createReset } from "./resets.js";
import { classesOnlyTaughtBy, deleteAccount } from "./accounts.js";

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
    };
}

function findAccount(id) {
    return db.prepare(`
        SELECT u.*, (SELECT COUNT(*) FROM class_students s WHERE s.user_id = u.id)
                  + (SELECT COUNT(*) FROM class_teachers t WHERE t.user_id = u.id) AS classes
        FROM users u WHERE u.id = ?
    `).get(id);
}

function invites() {
    return db.prepare(`
        SELECT i.code, i.uses_left AS usesLeft, i.created_at AS createdAt, i.expires_at AS expiresAt, u.name AS createdBy
        FROM teacher_invites i LEFT JOIN users u ON u.id = i.created_by
        WHERE i.uses_left > 0 AND (i.expires_at IS NULL OR i.expires_at > ?)
        ORDER BY i.created_at DESC
    `).all(Date.now()).map((i) => ({ ...i, code: formatCode(i.code) }));
}

// Administrators: teacher invitations, and every account (search, roles, password resets,
// deactivating and deleting). The first administrator is made with make-admin.js on the server.
export function adminRouter({ requireAuth }) {
    const router = express.Router();
    router.use(requireAuth, (req, res, next) => (req.user.is_admin ? next() : res.status(403).json({ error: "forbidden" })));

    router.get("/invites", (req, res) => res.json({ invites: invites() }));

    // A code for up to `uses` teachers to sign up with, valid for `days` days
    router.post("/invites", (req, res) => {
        const uses = req.body?.uses ?? 1;
        const days = req.body?.days ?? 14;
        if (!Number.isInteger(uses) || uses < 1 || uses > 100 || !Number.isInteger(days) || days < 1 || days > 90) {
            return res.status(400).json({ error: "bad_request" });
        }
        const now = Date.now();
        const code = generateCode();
        db.prepare("INSERT INTO teacher_invites (code, uses_left, created_at, created_by, expires_at) VALUES (?, ?, ?, ?, ?)")
            .run(code, uses, now, req.user.id, now + days * DAY);
        res.status(201).json({ code: formatCode(code), invites: invites() });
    });

    router.delete("/invites/:code", (req, res) => {
        db.prepare("DELETE FROM teacher_invites WHERE code = ?").run(normalizeCode(req.params.code));
        res.json({ invites: invites() });
    });

    // Accounts whose name or email contains `q` (all when empty), most recently active first
    router.get("/users", (req, res) => {
        const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
        const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        const rows = db.prepare(`
            SELECT u.*, (SELECT COUNT(*) FROM class_students s WHERE s.user_id = u.id)
                      + (SELECT COUNT(*) FROM class_teachers t WHERE t.user_id = u.id) AS classes
            FROM users u
            WHERE u.name LIKE @like ESCAPE '\\' OR u.email LIKE @like ESCAPE '\\'
            ORDER BY u.last_active_at DESC NULLS LAST, u.id DESC
            LIMIT 51
        `).all({ like });
        res.json({ users: rows.slice(0, 50).map(accountRow), more: rows.length > 50 });
    });

    // Changes an account's role, administrator rights or whether it can sign in. Administrators
    // can't change their own, so there's always one left who can undo a mistake.
    router.patch("/users/:id", (req, res) => {
        const user = findAccount(Number(req.params.id));
        if (!user) return res.status(404).json({ error: "not_found" });
        if (user.id === req.user.id) return res.status(409).json({ error: "cannot_change_self" });

        const { role, isAdmin, disabled } = req.body ?? {};
        if ((role !== undefined && role !== "student" && role !== "teacher")
            || (isAdmin !== undefined && typeof isAdmin !== "boolean")
            || (disabled !== undefined && typeof disabled !== "boolean")) {
            return res.status(400).json({ error: "bad_request" });
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
            if (isAdmin !== undefined) db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(isAdmin ? 1 : 0, user.id);
            if (disabled !== undefined) {
                db.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(disabled ? Date.now() : null, user.id);
                // A deactivated account is signed out everywhere at once
                if (disabled) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
            }
        })();
        res.json({ user: accountRow(findAccount(user.id)) });
    });

    // A one-time code to set a new password with ("Forgot your password?" on the sign-in page)
    router.post("/users/:id/reset", (req, res) => {
        const user = findAccount(Number(req.params.id));
        if (!user) return res.status(404).json({ error: "not_found" });
        res.json(createReset(user.id, req.user.id));
    });

    router.delete("/users/:id", wrap(async (req, res) => {
        const user = findAccount(Number(req.params.id));
        if (!user) return res.status(404).json({ error: "not_found" });
        if (user.id === req.user.id) return res.status(409).json({ error: "cannot_change_self" });
        const alone = classesOnlyTaughtBy(user.id);
        if (alone.length > 0) return res.status(409).json({ error: "classes_need_teacher", classes: alone.map((c) => c.name) });
        await deleteAccount(user.id);
        res.json({ ok: true });
    }));

    return router;
}
