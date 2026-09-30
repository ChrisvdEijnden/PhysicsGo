import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = process.env.PHYSICSGO_DB ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "physicsgo.db");
const db = new Database(file);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Each entry upgrades the schema by one version; PRAGMA user_version tracks which have run
const MIGRATIONS = [
    // 1: accounts and sessions
    `
    CREATE TABLE IF NOT EXISTS invite_codes (
        code TEXT PRIMARY KEY,
        class TEXT NOT NULL,
        uses_left INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        class TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
    );
    `,
    // 2: teacher-managed classes replace the command-line invite codes
    `
    DROP TABLE invite_codes;
    ALTER TABLE users DROP COLUMN class;
    ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher'));

    CREATE TABLE teacher_invites (
        code TEXT PRIMARY KEY,
        uses_left INTEGER NOT NULL
    );
    CREATE TABLE classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        join_open INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
    );
    -- Codes replaced by regeneration, kept so students get a clear "expired" message
    CREATE TABLE retired_class_codes (
        code TEXT PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE
    );
    CREATE TABLE class_teachers (
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (class_id, user_id)
    );
    CREATE TABLE class_students (
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (class_id, user_id)
    );
    CREATE INDEX class_teachers_user ON class_teachers(user_id);
    CREATE INDEX class_students_user ON class_students(user_id);
    `,
    // 3: projects published to classes. Projects themselves live in the app, so they're
    // referred to by their id; deleting a class unpublishes everything from it.
    `
    CREATE TABLE project_classes (
        project_id TEXT NOT NULL,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        published_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        published_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, class_id)
    );
    CREATE INDEX project_classes_class ON project_classes(class_id);
    `,
    // 4: session activity (idle timeout, signed-in devices list); class owners, archived
    // classes and co-teacher invitations. Existing sessions start a fresh idle period and
    // each existing class is owned by its longest-serving teacher.
    `
    ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT '';
    UPDATE sessions SET created_at = expires_at - 604800000,
                        last_seen_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000;
    CREATE INDEX sessions_user ON sessions(user_id);

    ALTER TABLE classes ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE classes ADD COLUMN archived_at INTEGER;
    UPDATE classes SET owner_id = (
        SELECT user_id FROM class_teachers t WHERE t.class_id = classes.id ORDER BY added_at, user_id LIMIT 1
    );

    -- Addressed to an email, so inviting reveals nothing about which addresses have accounts
    CREATE TABLE class_teacher_invites (
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        email TEXT NOT NULL COLLATE NOCASE,
        invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (class_id, email)
    );
    CREATE INDEX class_teacher_invites_email ON class_teacher_invites(email);
    `,
    // 5: one-time codes for setting a new password, handed out by a teacher (or on the server).
    // Only a hash is stored, like session tokens.
    `
    CREATE TABLE password_resets (
        code_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    );
    `,
    // 6: each user's work on a project (start values, model rules, graphs, media and points as
    // JSON, see src/data/Projects.tsx) and the media files themselves, which live on disk.
    // version goes up with every save, so an out-of-date browser can't overwrite newer work.
    `
    CREATE TABLE project_work (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        data TEXT NOT NULL,
        version INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, project_id)
    );
    CREATE TABLE media_files (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        media_id TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, project_id, media_id)
    );
    `,
    // 7: work a student handed in: a frozen copy of project_work.data at that moment, which
    // stays as it is while they keep working (work_version says which save it was)
    `
    CREATE TABLE submissions (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        data TEXT NOT NULL,
        work_version INTEGER NOT NULL,
        submitted_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, project_id)
    );
    `,
    // 8: projects live on the server so teachers can write their own. The built-in presets keep their
    // ids, so what's published, saved and handed in still points at them. project_classes is rebuilt
    // (SQLite can't add a foreign key to an existing table) so deleting a project unpublishes it.
    `
    CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        built_in INTEGER NOT NULL DEFAULT 0,
        curriculum INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL,
        explanation TEXT NOT NULL DEFAULT '',
        start TEXT,
        model TEXT,
        estimated_time INTEGER,
        equipment TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    INSERT INTO projects (id, built_in, curriculum, title, explanation, estimated_time, equipment, created_at, updated_at) VALUES
        ('harmonic-pendulum-drag', 1, 1, 'Harmonic Pendulum with Drag', 'Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.', 45, '[]', 0, 0),
        ('double-star-orbit', 1, 1, 'Double Star Orbit Simulation', 'Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.', 45, '[]', 0, 0),
        ('ideal-gas-collisions', 1, 0, 'Ideal Gas Elastic Collisions', 'Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.', 45, '[]', 0, 0),
        ('photon-interference', 1, 0, 'Photon Interference Wavefront', 'Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.', 45, '[]', 0, 0),
        ('standard-freefall', 1, 1, 'Standard Freefall', 'Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.', 45, '["A small cube", "measuring stick"]', 0, 0),
        ('lorentz-field-trajectory', 1, 1, 'Lorentz Field Trajectory', 'Traces the path of a charged particle moving through uniform electric and magnetic fields using the Lorentz force law.', 45, '[]', 0, 0),
        ('damped-harmonic-motion', 1, 0, 'Damped Harmonic Motion', 'Models a spring-mass system with a velocity-dependent damping force, showing amplitude decay over time.', 45, '[]', 0, 0);

    CREATE TABLE project_classes_new (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        published_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        published_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, class_id)
    );
    INSERT INTO project_classes_new (project_id, class_id, published_by, published_at)
        SELECT project_id, class_id, published_by, published_at FROM project_classes
        WHERE project_id IN (SELECT id FROM projects);
    DROP TABLE project_classes;
    ALTER TABLE project_classes_new RENAME TO project_classes;
    CREATE INDEX project_classes_class ON project_classes(class_id);
    `,
    // 9: videos and photos a teacher adds to a project, which every student starts with.
    // The files are on disk under projects/ (see media.js).
    `
    CREATE TABLE project_media (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        media_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('photo', 'video', 'animation', 'document')),
        size INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, media_id)
    );
    `,
    // 10: publishing to a class makes it an assignment there, with optional instructions for that
    // class, a moment it opens (students don't see it before) and a due date (later hand-ins are late)
    `
    ALTER TABLE project_classes ADD COLUMN instructions TEXT NOT NULL DEFAULT '';
    ALTER TABLE project_classes ADD COLUMN opens_at INTEGER;
    ALTER TABLE project_classes ADD COLUMN due_at INTEGER;
    `,
    // 11: administrators (who manage teacher invitations and accounts in the app), deactivated
    // accounts, when each account was last used (inactive ones are deleted after a while, see
    // index.js), and who made each teacher invitation and until when it works
    `
    ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN disabled_at INTEGER;
    ALTER TABLE users ADD COLUMN last_active_at INTEGER;
    -- Counted from this upgrade, so no existing account is deleted as inactive right away
    UPDATE users SET last_active_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000;
    ALTER TABLE teacher_invites ADD COLUMN created_at INTEGER;
    ALTER TABLE teacher_invites ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE teacher_invites ADD COLUMN expires_at INTEGER;
    `,
];

const current = db.pragma("user_version", { simple: true });
db.transaction(() => {
    for (let v = current; v < MIGRATIONS.length; v++) {
        db.exec(MIGRATIONS[v]);
        db.pragma(`user_version = ${v + 1}`);
    }
})();

export default db;
