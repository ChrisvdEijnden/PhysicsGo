import fs from "node:fs";
import db from "./db.js";
import { projectMediaDir, userMediaDir } from "./media.js";

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
