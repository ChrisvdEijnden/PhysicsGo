import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

// Uploaded media (videos, photos, documents) lives on disk (PHYSICSGO_MEDIA_DIR): students' files in
// a folder per user and project, the starter media of teachers' projects under projects/
const MB = 1024 * 1024;
const MEDIA_DIR = process.env.PHYSICSGO_MEDIA_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "media");
export const MAX_FILE = (Number(process.env.PHYSICSGO_MEDIA_MAX_MB) || 200) * MB;
export const QUOTA = (Number(process.env.PHYSICSGO_MEDIA_QUOTA_MB) || 2048) * MB;
// Media ids are made in the app from a timestamp and random letters
export const MEDIA_ID = /^[a-z0-9-]{1,64}$/;

const WORD_TYPES = new Set([
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
// What "Insert media" accepts. SVG is left out: it can carry scripts.
export const allowedType = (mime) =>
    (/^(image|video)\/[\w.+-]+$/.test(mime) && mime !== "image/svg+xml") || WORD_TYPES.has(mime);

export const mediaPath = (userId, projectId, mediaId) => path.join(MEDIA_DIR, String(userId), projectId, mediaId);
export const projectMediaDir = (projectId) => path.join(MEDIA_DIR, "projects", projectId);
export const projectMediaPath = (projectId, mediaId) => path.join(projectMediaDir(projectId), mediaId);

export const requestMime = (req) => (req.get("content-type") ?? "").split(";")[0].trim().toLowerCase();

// Streams the request body to `file`, never more than `limit` bytes. Resolves with the size, or null
// when the body was too large (nothing is left on disk then).
export async function storeUpload(req, file, limit) {
    const part = `${file}.${crypto.randomBytes(4).toString("hex")}.part`;
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    let size = 0;
    const count = new Transform({
        transform(chunk, _encoding, done) {
            size += chunk.length;
            done(size > limit ? Object.assign(new Error("too large"), { tooBig: true }) : null, chunk);
        },
    });
    try {
        await pipeline(req, count, fs.createWriteStream(part));
    } catch (e) {
        await fs.promises.rm(part, { force: true });
        if (e.tooBig) return null;
        throw e;
    }
    await fs.promises.rename(part, file);
    return size;
}

// Sends a media file so it can never run as a page of this site, whatever it contains
export function sendMedia(res, file, mime) {
    res.set("Content-Security-Policy", "default-src 'none'; sandbox");
    res.set("Cache-Control", "private, max-age=3600");
    res.sendFile(file, { headers: { "Content-Type": mime } });
}
