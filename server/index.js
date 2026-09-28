import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import argon from "argon2";
import crypto from "node:crypto";
import db from "./db.js";

const PROD = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 3001;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE = "physicsgo_session";
const EMAIL_RE = /^\S+@\S+\.\S+$/;

const app = express();
if (PROD) app.set("trust proxy", 1); // needed for correct client IPs behind a reverse proxy
app.use(helmet());
app.use(express.json({ limit: "10kb" })); // JSON only: cross-site form posts are ignored
app.use(cookieParser());

// Used to keep login timing equal when the email doesn't exist
const DUMMY_HASH = await argon.hash("dummy-password-for-timing");

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const str = (v) => (typeof v === "string" ? v : "");
const publicUser = (u) => ({ name: u.name, class: u.class, email: u.email });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
});

const cookieOptions = { httpOnly: true, sameSite: "lax", secure: PROD, path: "/" };

function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString("base64url");
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
    // Only a hash of the token is stored, so a leaked database can't be used to hijack sessions
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
        .run(sha256(token), userId, Date.now() + SESSION_MS);
    res.cookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_MS });
}

function currentUser(req) {
    const token = req.cookies[COOKIE];
    if (typeof token !== "string") return null;
    return db.prepare(`
        SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(sha256(token), Date.now()) ?? null;
}

function requireAuth(req, res, next) {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: "unauthenticated" });
    req.user = user;
    next();
}

const normalizeCode = (c) => str(c).trim().toUpperCase();
const findInvite = (code) =>
    db.prepare("SELECT class FROM invite_codes WHERE code = ? AND uses_left > 0").get(code);

const api = express.Router();

api.get("/auth/me", (req, res) => {
    const user = currentUser(req);
    res.json({ user: user ? publicUser(user) : null });
});

api.post("/auth/code", authLimiter, (req, res) => {
    const code = normalizeCode(req.body?.code);
    if (!code || !findInvite(code)) return res.status(400).json({ error: "invalid_code" });
    res.json({ ok: true });
});

api.post("/auth/register", authLimiter, wrap(async (req, res) => {
    const code = normalizeCode(req.body?.code);
    const name = str(req.body?.name).trim();
    const email = str(req.body?.email).trim().toLowerCase();
    const password = str(req.body?.password);

    if (!code) return res.status(400).json({ error: "invalid_code" });
    if (!name || name.length > 100) return res.status(400).json({ error: "invalid_name" });
    if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: "invalid_email" });
    if (password.length < 10 || password.length > 128) return res.status(400).json({ error: "weak_password" });

    const hash = await argon.hash(password); // argon2id, random salt included in the hash

    const create = db.transaction(() => {
        const invite = findInvite(code);
        if (!invite) return { error: "invalid_code" };
        if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return { error: "email_taken" };
        db.prepare("UPDATE invite_codes SET uses_left = uses_left - 1 WHERE code = ?").run(code);
        const info = db.prepare(
            "INSERT INTO users (name, class, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(name, invite.class, email, hash, Date.now());
        return { id: info.lastInsertRowid };
    });

    const result = create();
    if (result.error) {
        return res.status(result.error === "email_taken" ? 409 : 400).json({ error: result.error });
    }
    startSession(res, result.id);
    res.status(201).json({ user: { name, class: findInvite(code)?.class ?? "", email } });
}));

api.post("/auth/login", authLimiter, wrap(async (req, res) => {
    const email = str(req.body?.email).trim().toLowerCase();
    const password = str(req.body?.password);

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    const valid = await argon.verify(user?.password_hash ?? DUMMY_HASH, password).catch(() => false);

    // Same response whether the email or the password was wrong
    if (!user || !valid) return res.status(401).json({ error: "invalid_credentials" });

    startSession(res, user.id);
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

api.patch("/auth/me", requireAuth, (req, res) => {
    const body = req.body ?? {};
    const next = publicUser(req.user);

    if ("name" in body) {
        const v = str(body.name).trim();
        if (!v || v.length > 100) return res.status(400).json({ error: "invalid_name" });
        next.name = v;
    }
    if ("class" in body) {
        const v = str(body.class).trim();
        if (v.length > 20) return res.status(400).json({ error: "invalid_class" });
        next.class = v;
    }
    if ("email" in body) {
        const v = str(body.email).trim().toLowerCase();
        if (!EMAIL_RE.test(v) || v.length > 254) return res.status(400).json({ error: "invalid_email" });
        next.email = v;
    }

    try {
        db.prepare("UPDATE users SET name = ?, class = ?, email = ? WHERE id = ?")
            .run(next.name, next.class, next.email, req.user.id);
    } catch (e) {
        if (e.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "email_taken" });
        throw e;
    }
    res.json({ user: next });
});

app.use("/api", api);
app.use("/api", (req, res) => res.status(404).json({ error: "not_found" }));

app.use((err, req, res, _next) => {
    if (err.status && err.status < 500) return res.status(err.status).json({ error: "bad_request" });
    console.error(err);
    res.status(500).json({ error: "server_error" });
});

app.listen(PORT, () => console.log(`PhysicsGo API on :${PORT}`));