import db from "./db.js";

// Schools group teachers, their classes and students: co-teaching and joining classes only work
// within a school. Administrators create them (Administration page); the first one is made from the
// command line with create-teacher-code.js, or by migration 15 for existing data ("Mijn school").

export const validSchoolName = (name) => {
    const v = typeof name === "string" ? name.trim() : "";
    return v && v.length <= 100 ? v : null;
};

export function schoolOf(user) {
    if (!user.school_id) return null;
    return db.prepare("SELECT id, name FROM schools WHERE id = ?").get(user.school_id) ?? null;
}

// The school named `name` (made when there's none yet); without a name, the only school there is,
// or a first one called "Mijn school". Null when there are several and no name says which.
export function resolveSchool(name) {
    if (name) {
        const found = db.prepare("SELECT id FROM schools WHERE name = ?").get(name);
        if (found) return found.id;
        return Number(db.prepare("INSERT INTO schools (name, created_at) VALUES (?, ?)").run(name, Date.now()).lastInsertRowid);
    }
    const all = db.prepare("SELECT id FROM schools").all();
    if (all.length === 1) return all[0].id;
    if (all.length === 0) return resolveSchool("Mijn school");
    return null;
}

// Every school with how many teachers, students, classes and open invitations it has
export function listSchools() {
    return db.prepare(`
        SELECT s.id, s.name,
               (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id AND u.role = 'teacher') AS teachers,
               (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id AND u.role = 'student') AS students,
               (SELECT COUNT(*) FROM classes c WHERE c.school_id = s.id) AS classes,
               (SELECT COUNT(*) FROM teacher_invites i WHERE i.school_id = s.id
                  AND i.uses_left > 0 AND (i.expires_at IS NULL OR i.expires_at > @now)) AS invites
        FROM schools s ORDER BY s.name COLLATE NOCASE
    `).all({ now: Date.now() });
}
