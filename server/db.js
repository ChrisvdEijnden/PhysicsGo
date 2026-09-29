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
];

const current = db.pragma("user_version", { simple: true });
db.transaction(() => {
    for (let v = current; v < MIGRATIONS.length; v++) {
        db.exec(MIGRATIONS[v]);
        db.pragma(`user_version = ${v + 1}`);
    }
})();

export default db;
