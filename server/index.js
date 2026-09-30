import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import argon from "argon2";
import crypto from "node:crypto";
import db from "./db.js";
import { classesOf, classesRouter, lookupCode, purgeArchivedClasses } from "./classes.js";
import { projectsRouter } from "./projects.js";
import { findReset, purgeExpiredResets } from "./resets.js";
import { mediaRouter, workRouter } from "./work.js";

const PROD = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 3001;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
// School computers are shared, so a session also ends after this long without use (SESSION_IDLE_HOURS)
const IDLE_HOURS = Number(process.env.SESSION_IDLE_HOURS);
const SESSION_IDLE_MS = (IDLE_HOURS > 0 ? IDLE_HOURS : 8) * 60 * 60 * 1000;
// A session's last use is only rewritten when it's this old, so requests don't each cause a write
const TOUCH_MS = 5 * 60 * 1000;
const COOKIE = "physicsgo_session";
const EMAIL_RE = /^\S+@\S+\.\S+$/;

const app = express();
// Rate limits need the real client IP. Behind a reverse proxy, set TRUST_PROXY to the number of
// proxies in front (usually 1) or to their addresses (e.g. "loopback"); without it, X-Forwarded-For
// is ignored so clients can't pick their own IP.
const TRUST_PROXY = process.env.TRUST_PROXY;
if (TRUST_PROXY) app.set("trust proxy", /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY);
app.use(helmet());
// JSON only: cross-site form posts are ignored. Saved work and projects can be larger and have their
// own limits (work.js, projects.js).
const smallJson = express.json({ limit: "10kb" });
const ownLimit = (path) => path.startsWith("/api/work/") || path.startsWith("/api/projects");
app.use((req, res, next) => (ownLimit(req.path) ? next() : smallJson(req, res, next)));
app.use(cookieParser());

// Used to keep login timing equal when the email doesn't exist
const DUMMY_HASH = await argon.hash("dummy-password-for-timing");

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const str = (v) => (typeof v === "string" ? v : "");
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, classes: classesOf(u) });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Only failed attempts count: a school's devices usually share one IP, and a class signing in
// at the start of a lesson mustn't use up the budget.
const limiter = (options) => rateLimit({
    windowMs: 15 * 60 * 1000,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
});

// Per IP, for sign-in, registration and code checks: room for a building full of typos,
// still far too slow for guessing codes or passwords
const authLimiter = limiter({ limit: 100 });

// Per account and IP: guessing one password stops quickly without locking out anyone else
const loginLimiter = limiter({
    limit: 10,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${str(req.body?.email).trim().toLowerCase()}`,
});

// Signed-in requests are counted per account instead of per IP
const accountLimiter = () => limiter({ limit: 10, keyGenerator: (req) => `user:${req.user.id}` });
const joinLimiter = accountLimiter();
const passwordLimiter = accountLimiter();

const cookieOptions = { httpOnly: true, sameSite: "lax", secure: PROD, path: "/" };

function startSession(req, res, userId) {
    const token = crypto.randomBytes(32).toString("base64url");
    const now = Date.now();
    // Only a hash of the token is stored, so a leaked database can't be used to hijack sessions
    db.prepare(`
        INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, user_agent)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(sha256(token), userId, now, now, now + SESSION_MS, str(req.get("user-agent")).slice(0, 300));
    res.cookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_MS });
}

// The signed-in user and their session's token hash, or null. Each use keeps the session alive.
function currentSession(req) {
    const token = req.cookies[COOKIE];
    if (typeof token !== "string") return null;
    const now = Date.now();
    const row = db.prepare(`
        SELECT u.*, s.token_hash AS session_hash, s.last_seen_at AS session_seen
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ? AND s.last_seen_at > ?
    `).get(sha256(token), now, now - SESSION_IDLE_MS);
    if (!row) return null;

    const { session_hash: tokenHash, session_seen: seen, ...user } = row;
    if (now - seen > TOUCH_MS) db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(now, tokenHash);
    return { user, tokenHash };
}

function requireAuth(req, res, next) {
    const session = currentSession(req);
    if (!session) return res.status(401).json({ error: "unauthenticated" });
    req.user = session.user;
    req.sessionHash = session.tokenHash;
    next();
}

// Ends every session of the user except `keepHash` (the current one), e.g. "sign out everywhere else"
function endOtherSessions(userId, keepHash) {
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(userId, keepHash);
}

// The account's signed-in browsers, most recently used first
function sessionsOf(userId, currentHash) {
    const now = Date.now();
    return db.prepare(`
        SELECT token_hash, created_at, last_seen_at, user_agent FROM sessions
        WHERE user_id = ? AND expires_at > ? AND last_seen_at > ?
        ORDER BY last_seen_at DESC
    `).all(userId, now, now - SESSION_IDLE_MS).map((s) => ({
        id: s.token_hash,
        current: s.token_hash === currentHash,
        createdAt: s.created_at,
        lastSeenAt: s.last_seen_at,
        userAgent: s.user_agent,
    }));
}

// Expired and idle sessions, and classes past their time in the archive, are removed hourly
function cleanUp() {
    const now = Date.now();
    db.prepare("DELETE FROM sessions WHERE expires_at <= ? OR last_seen_at <= ?").run(now, now - SESSION_IDLE_MS);
    purgeArchivedClasses(now);
    purgeExpiredResets(now);
}
cleanUp();
setInterval(cleanUp, 60 * 60 * 1000).unref();

const api = express.Router();

api.get("/auth/me", (req, res) => {
    const session = currentSession(req);
    res.json({ user: session ? publicUser(session.user) : null });
});

// Checked before showing the registration form: a class code signs up a student,
// a teacher invitation signs up a teacher
api.post("/auth/code", authLimiter, (req, res) => {
    const found = lookupCode(req.body?.code);
    if (found.error) return res.status(400).json({ error: found.error });
    res.json({ kind: found.kind, className: found.class?.name ?? null });
});

api.post("/auth/register", authLimiter, wrap(async (req, res) => {
    const code = req.body?.code;
    const name = str(req.body?.name).trim();
    const email = str(req.body?.email).trim().toLowerCase();
    const password = str(req.body?.password);

    const codeError = lookupCode(code).error;
    if (codeError) return res.status(400).json({ error: codeError });
    if (!name || name.length > 100) return res.status(400).json({ error: "invalid_name" });
    if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: "invalid_email" });
    if (password.length < 10 || password.length > 128) return res.status(400).json({ error: "weak_password" });

    const hash = await argon.hash(password); // argon2id, random salt included in the hash

    const create = db.transaction(() => {
        // Looked up again inside the transaction: the code may have changed since /auth/code
        const found = lookupCode(code);
        if (found.error) return found;
        if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return { error: "email_taken" };

        const now = Date.now();
        const role = found.kind === "teacher" ? "teacher" : "student";
        const info = db.prepare(
            "INSERT INTO users (name, email, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(name, email, role, hash, now);

        if (found.kind === "teacher") {
            db.prepare("UPDATE teacher_invites SET uses_left = uses_left - 1 WHERE code = ?").run(found.code);
        } else {
            db.prepare("INSERT INTO class_students (class_id, user_id, joined_at) VALUES (?, ?, ?)")
                .run(found.class.id, info.lastInsertRowid, now);
        }
        return { id: info.lastInsertRowid };
    });

    const result = create();
    if (result.error) {
        return res.status(result.error === "email_taken" ? 409 : 400).json({ error: result.error });
    }
    startSession(req, res, result.id);
    res.status(201).json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(result.id)) });
}));

api.post("/auth/login", authLimiter, loginLimiter, wrap(async (req, res) => {
    const email = str(req.body?.email).trim().toLowerCase();
    const password = str(req.body?.password);

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    const valid = await argon.verify(user?.password_hash ?? DUMMY_HASH, password).catch(() => false);

    // Same response whether the email or the password was wrong
    if (!user || !valid) return res.status(401).json({ error: "invalid_credentials" });

    startSession(req, res, user.id);
    res.json({ user: publicUser(user) });
}));

// A reset code from a teacher: first shows whose password it resets, then sets the new one
api.post("/auth/reset/check", authLimiter, (req, res) => {
    const user = findReset(req.body?.code);
    if (!user) return res.status(400).json({ error: "invalid_reset_code" });
    res.json({ name: user.name, email: user.email });
});

api.post("/auth/reset", authLimiter, wrap(async (req, res) => {
    const password = str(req.body?.password);
    if (password.length < 10 || password.length > 128) return res.status(400).json({ error: "weak_password" });
    const hash = await argon.hash(password);

    const user = db.transaction(() => {
        const found = findReset(req.body?.code);
        if (!found) return null;
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, found.id);
        db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(found.id);
        // Anyone still signed in with the old password is signed out
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(found.id);
        return found;
    })();
    if (!user) return res.status(400).json({ error: "invalid_reset_code" });

    startSession(req, res, user.id);
    res.json({ user: publicUser(user) });
}));

api.post("/auth/logout", (req, res) => {
    const token = req.cookies[COOKIE];
    if (typeof token === "string") {
        db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
    }
    res.clearCookie(COOKIE, cookieOptions);
    res.json({ ok: true });
});

api.patch("/auth/me", requireAuth, passwordLimiter, wrap(async (req, res) => {
    const body = req.body ?? {};
    const next = { name: req.user.name, email: req.user.email };

    if ("name" in body) {
        const v = str(body.name).trim();
        if (!v || v.length > 100) return res.status(400).json({ error: "invalid_name" });
        next.name = v;
    }
    if ("email" in body) {
        const v = str(body.email).trim().toLowerCase();
        if (!EMAIL_RE.test(v) || v.length > 254) return res.status(400).json({ error: "invalid_email" });
        // The email is how an account is signed in to, so changing it takes the password:
        // someone at a computer that was left signed in can't take the account over
        if (v !== req.user.email) {
            const valid = await argon.verify(req.user.password_hash, str(body.currentPassword)).catch(() => false);
            if (!valid) return res.status(403).json({ error: "wrong_password" });
        }
        next.email = v;
    }

    try {
        db.prepare("UPDATE users SET name = ?, email = ? WHERE id = ?")
            .run(next.name, next.email, req.user.id);
    } catch (e) {
        if (e.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "email_taken" });
        throw e;
    }
    res.json({ user: publicUser({ ...req.user, ...next }) });
}));

// A new password needs the current one; every other browser signed in to the account is signed out
api.post("/auth/password", requireAuth, passwordLimiter, wrap(async (req, res) => {
    const password = str(req.body?.newPassword);
    const valid = await argon.verify(req.user.password_hash, str(req.body?.currentPassword)).catch(() => false);
    if (!valid) return res.status(403).json({ error: "wrong_password" });
    if (password.length < 10 || password.length > 128) return res.status(400).json({ error: "weak_password" });
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await argon.hash(password), req.user.id);
    endOtherSessions(req.user.id, req.sessionHash);
    res.json({ ok: true });
}));

api.get("/auth/sessions", requireAuth, (req, res) => {
    res.json({ sessions: sessionsOf(req.user.id, req.sessionHash) });
});

// Signs out one browser; ending the current one signs out here too
api.delete("/auth/sessions/:id", requireAuth, (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token_hash = ? AND user_id = ?").run(req.params.id, req.user.id);
    if (req.params.id === req.sessionHash) {
        res.clearCookie(COOKIE, cookieOptions);
        return res.json({ sessions: [] });
    }
    res.json({ sessions: sessionsOf(req.user.id, req.sessionHash) });
});

api.post("/auth/sessions/end-others", requireAuth, (req, res) => {
    endOtherSessions(req.user.id, req.sessionHash);
    res.json({ sessions: sessionsOf(req.user.id, req.sessionHash) });
});

api.use("/classes", classesRouter({ requireAuth, joinLimiter, publicUser }));
api.use("/projects", projectsRouter({ requireAuth }));
api.use("/work", workRouter({ requireAuth }));
api.use("/media", mediaRouter({ requireAuth }));

app.use("/api", api);
app.use("/api", (req, res) => res.status(404).json({ error: "not_found" }));

app.use((err, req, res, _next) => {
    if (err.status && err.status < 500) return res.status(err.status).json({ error: "bad_request" });
    console.error(err);
    res.status(500).json({ error: "server_error" });
});

app.listen(PORT, () => console.log(`PhysicsGo API on :${PORT}`));