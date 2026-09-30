import db from "./db.js";

// What administrators can look back on (Administration → Activity): who deleted or changed accounts,
// classes, schools and assignments, and when. Entries are kept for AUDIT_RETENTION_DAYS (default 365).
// The names of the one acting and of what it was about are copied in, so an entry still makes sense
// after an account or class is gone. Deletions nobody did by hand (the archive, unused accounts) and
// people deleting their own account are logged without names.
const DAY = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS ?? 365);

// `actor` is the signed-in user (or null for PhysicsGo itself); `target` names what it was about;
// `details` holds anything else the entry shows, such as the class
export function audit(actor, action, target = null, details = null) {
    db.prepare("INSERT INTO audit_log (at, actor_id, actor_name, action, target_label, details) VALUES (?, ?, ?, ?, ?, ?)")
        .run(Date.now(), actor?.id ?? null, actor?.name ?? null, action, target, details ? JSON.stringify(details) : null);
}

// How an account is named in the log
export const accountLabel = (user) => `${user.name} (${user.email})`;

export function auditEntries(limit = 200) {
    return db.prepare("SELECT * FROM audit_log ORDER BY at DESC, id DESC LIMIT ?").all(limit).map((e) => ({
        id: e.id,
        at: e.at,
        actor: e.actor_name,
        action: e.action,
        target: e.target_label,
        details: e.details ? JSON.parse(e.details) : {},
    }));
}

export function purgeAuditLog(now = Date.now()) {
    if (RETENTION_DAYS > 0) db.prepare("DELETE FROM audit_log WHERE at < ?").run(now - RETENTION_DAYS * DAY);
}
