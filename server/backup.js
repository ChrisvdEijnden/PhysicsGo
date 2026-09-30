import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "./db.js";

// A copy of the database is made once a day (the first hourly check of each UTC day) into
// PHYSICSGO_BACKUP_DIR, and the newest PHYSICSGO_BACKUPS copies are kept (0 turns backups off).
// SQLite's online backup copies a consistent state while the server keeps running. Uploaded media
// are files on disk and need their own backup (see docs/deployment.md).
const DIR = process.env.PHYSICSGO_BACKUP_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "backups");
const KEEP = Number(process.env.PHYSICSGO_BACKUPS ?? 14);
const NAME = /^physicsgo-\d{4}-\d{2}-\d{2}\.db$/;

export async function backupIfDue(now = Date.now()) {
    if (!(KEEP > 0)) return;
    await fs.promises.mkdir(DIR, { recursive: true });
    const existing = (await fs.promises.readdir(DIR)).filter((f) => NAME.test(f));
    const today = `physicsgo-${new Date(now).toISOString().slice(0, 10)}.db`;
    if (!existing.includes(today)) {
        const target = path.join(DIR, today);
        // Written under another name first, so a half-written file never looks like a backup
        await db.backup(`${target}.partial`);
        await fs.promises.rename(`${target}.partial`, target);
        existing.push(today);
    }
    for (const old of existing.sort().slice(0, -KEEP)) {
        await fs.promises.rm(path.join(DIR, old), { force: true });
    }
}
