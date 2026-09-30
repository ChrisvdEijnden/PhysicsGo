import fs from "node:fs";
import db from "./db.js";
import { projectMediaDir, userMediaDir } from "./media.js";
import { audit } from "./audit.js";

// Classes that would have no teacher left if this teacher's account were deleted
export function classesOnlyTaughtBy(userId) {
    return db.prepare(`
        SELECT c.id, c.name FROM classes c
        JOIN class_teachers t ON t.class_id = c.id AND t.user_id = ?
        WHERE NOT EXISTS (SELECT 1 FROM class_teachers o WHERE o.class_id = c.id AND o.user_id != ?)
        ORDER BY c.name COLLATE NOCASE
    `).all(userId, userId);
}

// Deletes an account and what is only theirs: sessions, class memberships, saved and handed-in work,
// uploaded files (the tables cascade), and assignments they wrote that no class uses (a student's own
// assignments, a teacher's unpublished ones). Assignments published to a class stay for that class.
export async function deleteAccount(userId) {
    const removedProjects = db.transaction(() => {
        const unused = db.prepare(`
            SELECT id FROM projects p
            WHERE p.author_id = ? AND NOT EXISTS (SELECT 1 FROM project_classes pc WHERE pc.project_id = p.id)
        `).all(userId).map((p) => p.id);
        for (const id of unused) db.prepare("DELETE FROM projects WHERE id = ?").run(id);
        db.prepare("DELETE FROM users WHERE id = ?").run(userId);
        return unused;
    })();
    await fs.promises.rm(userMediaDir(userId), { recursive: true, force: true });
    for (const id of removedProjects) await fs.promises.rm(projectMediaDir(id), { recursive: true, force: true });
}

// Accounts not used since `before` are deleted with everything that's only theirs (see deleteAccount).
// Administrators are kept, and so are teachers who are still the only teacher of a class.
export async function deleteInactiveAccounts(before) {
    const stale = db.prepare(`
        SELECT id FROM users WHERE is_admin = 0 AND COALESCE(last_active_at, created_at) < ?
    `).all(before);
    let count = 0;
    for (const { id } of stale) {
        if (classesOnlyTaughtBy(id).length > 0) continue;
        await deleteAccount(id);
        count++;
    }
    // Only how many: these people didn't ask for anything to be kept about them
    if (count > 0) audit(null, "account.expire", null, { count });
}

// Everything stored about an account, readable (the right of access): account details, classes,
// the user's own assignments, their saved and handed-in work, and the files they uploaded
export function exportAccount(userId) {
    const iso = (ms) => (ms === null || ms === undefined ? null : new Date(ms).toISOString());
    const json = (text) => {
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    };
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    const title = "(SELECT title FROM projects p WHERE p.id = x.project_id) AS title";
    return {
        exportedAt: iso(Date.now()),
        account: {
            name: user.name,
            email: user.email,
            role: user.role,
            administrator: Boolean(user.is_admin),
            school: db.prepare("SELECT name FROM schools WHERE id = ?").get(user.school_id)?.name ?? null,
            createdAt: iso(user.created_at),
            lastActiveAt: iso(user.last_active_at),
        },
        classes: [
            ...db.prepare(`
                SELECT c.name, x.joined_at AS since, 'student' AS as_role FROM class_students x JOIN classes c ON c.id = x.class_id
                WHERE x.user_id = ?
            `).all(userId),
            ...db.prepare(`
                SELECT c.name, x.added_at AS since, 'teacher' AS as_role FROM class_teachers x JOIN classes c ON c.id = x.class_id
                WHERE x.user_id = ?
            `).all(userId),
        ].map((c) => ({ name: c.name, as: c.as_role, since: iso(c.since) })),
        ownAssignments: db.prepare(`
            SELECT id, title, explanation, start, model, estimated_time, equipment, created_at, updated_at
            FROM projects WHERE author_id = ?
        `).all(userId).map((p) => ({
            id: p.id,
            title: p.title,
            explanation: p.explanation,
            startValues: p.start,
            modelRules: p.model,
            estimatedMinutes: p.estimated_time,
            equipment: json(p.equipment),
            createdAt: iso(p.created_at),
            updatedAt: iso(p.updated_at),
        })),
        work: db.prepare(`SELECT x.project_id, ${title}, x.version, x.updated_at, x.data FROM project_work x WHERE x.user_id = ?`)
            .all(userId).map((w) => ({
                assignment: w.title ?? w.project_id,
                version: w.version,
                savedAt: iso(w.updated_at),
                work: json(w.data),
            })),
        handedIn: db.prepare(`SELECT x.project_id, ${title}, x.submitted_at, x.data FROM submissions x WHERE x.user_id = ?`)
            .all(userId).map((h) => ({ assignment: h.title ?? h.project_id, handedInAt: iso(h.submitted_at), work: json(h.data) })),
        uploadedFiles: db.prepare(`SELECT x.project_id, ${title}, x.media_id, x.mime, x.size, x.created_at FROM media_files x WHERE x.user_id = ?`)
            .all(userId).map((f) => ({
                assignment: f.title ?? f.project_id,
                id: f.media_id,
                type: f.mime,
                bytes: f.size,
                uploadedAt: iso(f.created_at),
            })),
    };
}
