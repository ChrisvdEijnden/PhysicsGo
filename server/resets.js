import crypto from "node:crypto";
import db from "./db.js";
import { formatCode, normalizeCode, randomCode } from "./codes.js";

// A reset code lets its holder choose a new password once. Students get one from their teacher,
// who reads it out or copies it; teachers get one from reset-password.js on the server.
export const RESET_MS = 24 * 60 * 60 * 1000;

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

// Replaces any earlier code for the same account
export function createReset(userId, createdBy) {
    const code = randomCode();
    const now = Date.now();
    db.prepare(`
        INSERT OR REPLACE INTO password_resets (code_hash, user_id, created_by, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(sha256(code), userId, createdBy, now, now + RESET_MS);
    return { code: formatCode(code), expiresAt: now + RESET_MS };
}

// The account a code resets, or null when the code is unknown, used or expired
export function findReset(raw) {
    const code = normalizeCode(raw);
    if (!code) return null;
    return db.prepare(`
        SELECT u.* FROM password_resets r JOIN users u ON u.id = r.user_id
        WHERE r.code_hash = ? AND r.expires_at > ?
    `).get(sha256(code), Date.now()) ?? null;
}

export function purgeExpiredResets(now = Date.now()) {
    db.prepare("DELETE FROM password_resets WHERE expires_at <= ?").run(now);
}
