// End-to-end tests of the API: a real server on a throwaway database and media folder, driven over
// HTTP the way the app does. Run with `pnpm --filter server test` (or `pnpm test` at the root).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "physicsgo-test-"));
const port = 4100 + Math.floor(Math.random() * 800);
const env = {
    ...process.env,
    PORT: String(port),
    PHYSICSGO_DB: path.join(dataDir, "test.db"),
    PHYSICSGO_MEDIA_DIR: path.join(dataDir, "media"),
    PHYSICSGO_BACKUP_DIR: path.join(dataDir, "backups"),
    // No built app is served during the tests
    PHYSICSGO_STATIC: path.join(dataDir, "no-app"),
    NODE_ENV: "test",
};
const BASE = `http://localhost:${port}/api`;
let server;

// One browser: remembers its session cookie like a real one
function client() {
    let cookie = "";
    return async (method, url, body) => {
        const res = await fetch(BASE + url, {
            method,
            headers: {
                ...(body === undefined ? {} : { "Content-Type": "application/json" }),
                ...(cookie ? { Cookie: cookie } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        for (const header of res.headers.getSetCookie()) {
            const [pair] = header.split(";");
            const value = pair.slice(pair.indexOf("=") + 1);
            cookie = value ? pair : "";
        }
        return { status: res.status, data: await res.json().catch(() => ({})) };
    };
}

// For the only school there is (made with the first one), or for the school named
function teacherInvite(school) {
    const args = ["create-teacher-code.js", "5", ...(school ? [school] : [])];
    return execFileSync("node", args, { cwd: serverDir, env }).toString().split(" ")[0];
}

const PASSWORD = "correct-horse-battery";
const project = (title) => ({ title, explanation: "", start: null, model: null, estimatedTime: null, equipment: [] });

async function signUp(browser, code, name, email) {
    const res = await browser("POST", "/auth/register", { code, name, email, password: PASSWORD });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    return res.data.user;
}

before(async () => {
    server = spawn("node", ["index.js"], { cwd: serverDir, env, stdio: ["ignore", "pipe", "inherit"] });
    for (let i = 0; i < 100; i++) {
        try {
            if ((await fetch(`${BASE}/auth/me`)).ok) return;
        } catch {
            // not listening yet
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("the API didn't start");
});

after(() => {
    server?.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("running the server", () => {
    test("the health check answers, and today's database backup exists", async () => {
        const res = await fetch(`${BASE}/health`);
        const body = await res.json();
        assert.equal(body.ok, true);
        assert.match(body.version, /^\d+\.\d+\.\d+$/);
        // Made in the background when the server starts
        const today = [`physicsgo-${new Date().toISOString().slice(0, 10)}.db`];
        const dir = path.join(dataDir, "backups");
        const backups = () => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.endsWith(".partial")) : []);
        for (let i = 0; i < 50 && backups().length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 50));
        assert.deepEqual(backups(), today);
    });
});

describe("signing in", () => {
    test("signed out, /auth/me is empty and everything else asks to sign in", async () => {
        const anonymous = client();
        assert.deepEqual((await anonymous("GET", "/auth/me")).data, { user: null });
        for (const url of ["/projects", "/work", "/classes", "/auth/sessions"]) {
            const res = await anonymous("GET", url);
            assert.equal(res.status, 401, url);
            assert.equal(res.data.error, "unauthenticated", url);
        }
    });

    test("a teacher signs up with an invitation; wrong passwords and unknown emails get the same answer", async () => {
        const teacher = client();
        const user = await signUp(teacher, teacherInvite(), "Teacher One", "one@school.test");
        assert.equal(user.role, "teacher");

        const other = client();
        const wrong = await other("POST", "/auth/login", { email: "one@school.test", password: "not-the-password" });
        const unknown = await other("POST", "/auth/login", { email: "nobody@school.test", password: PASSWORD });
        assert.equal(wrong.status, 401);
        assert.deepEqual(wrong.data, unknown.data);
        assert.equal((await other("POST", "/auth/login", { email: "ONE@school.test", password: PASSWORD })).status, 200);
    });

    test("changing the email or password takes the current password; a new password signs out other devices", async () => {
        const laptop = client();
        await signUp(laptop, teacherInvite(), "Teacher Two", "two@school.test");
        const phone = client();
        assert.equal((await phone("POST", "/auth/login", { email: "two@school.test", password: PASSWORD })).status, 200);

        assert.equal((await laptop("PATCH", "/auth/me", { email: "new@school.test" })).status, 403);
        assert.equal((await laptop("PATCH", "/auth/me", { email: "new@school.test", currentPassword: PASSWORD })).status, 200);

        assert.equal((await laptop("POST", "/auth/password", { currentPassword: "wrong-password", newPassword: "another-password" })).status, 403);
        assert.equal((await laptop("POST", "/auth/password", { currentPassword: PASSWORD, newPassword: "short" })).data.error, "weak_password");
        assert.equal((await laptop("POST", "/auth/password", { currentPassword: PASSWORD, newPassword: "another-password" })).status, 200);

        assert.equal((await laptop("GET", "/auth/me")).data.user.email, "new@school.test");
        assert.equal((await phone("GET", "/auth/me")).data.user, null);
        const again = client();
        assert.equal((await again("POST", "/auth/login", { email: "new@school.test", password: "another-password" })).status, 200);
    });
});

describe("classes, assignments and work", () => {
    const teacher = client();
    const student = client();
    const classmate = client();
    let classId;
    let studentId;

    before(async () => {
        await signUp(teacher, teacherInvite(), "Teacher Three", "three@school.test");
        const created = await teacher("POST", "/classes", { name: "5V natuurkunde" });
        assert.equal(created.status, 201);
        classId = created.data.class.id;
        const code = created.data.class.code;
        assert.equal((await student("POST", "/auth/code", { code })).data.kind, "class");
        studentId = (await signUp(student, code, "Student A", "a@school.test")).id;
        await signUp(classmate, code, "Student B", "b@school.test");
    });

    test("students only see an assignment once it's published to their class", async () => {
        assert.deepEqual((await student("GET", "/projects")).data.projects, []);
        assert.equal((await student("PUT", "/projects/standard-freefall/classes", { classIds: [classId] })).status, 403);
        const published = await teacher("PUT", "/projects/standard-freefall/classes", { classIds: [classId] });
        assert.deepEqual(published.data.classes.map((c) => c.id), [classId]);
        const [freefall] = (await student("GET", "/projects")).data.projects;
        assert.equal(freefall.id, "standard-freefall");
        // Built-in assignments come with starter code and the graphs to start with
        assert.match(freefall.model, /stop als/);
        assert.deepEqual(freefall.graphs[0], { x: "t", ys: ["h"] });
    });

    test("students make their own assignments, which only they see and can't publish", async () => {
        const created = await student("POST", "/projects", project("My pendulum"));
        assert.equal(created.status, 201);
        const own = created.data.project;
        assert.equal(own.mine, true);

        assert.ok((await student("GET", "/projects")).data.projects.some((p) => p.id === own.id));
        assert.ok(!(await classmate("GET", "/projects")).data.projects.some((p) => p.id === own.id));
        assert.ok(!(await teacher("GET", "/projects")).data.projects.some((p) => p.id === own.id));
        assert.equal((await student("PUT", `/projects/${own.id}/classes`, { classIds: [classId] })).status, 403);
        assert.equal((await classmate("PATCH", `/projects/${own.id}`, { title: "Taken" })).status, 404);
        assert.equal((await student("PATCH", `/projects/${own.id}`, { title: "Renamed" })).data.project.title, "Renamed");

        // Deleting it takes the work on it along
        await student("PUT", `/work/${own.id}`, { work: { start: "t = 0\n", model: "", steps: "", graphs: [], media: [] }, version: 0 });
        assert.equal((await student("DELETE", `/projects/${own.id}`)).status, 200);
        assert.equal((await student("GET", `/work/${own.id}`)).data.version, 0);
    });

    test("work is saved in versions; saving over a newer version is a conflict", async () => {
        const work = { start: "t = 0\ndt = 0.1\n", model: "stop als t >= 1\n", steps: "", graphs: [], media: [] };
        const first = await student("PUT", "/work/standard-freefall", { work, version: 0 });
        assert.deepEqual([first.status, first.data.version], [200, 1]);
        const stale = await student("PUT", "/work/standard-freefall", { work: { ...work, steps: "5" }, version: 0 });
        assert.equal(stale.status, 409);
        assert.equal(stale.data.version, 1);
        assert.deepEqual((await student("GET", "/work/standard-freefall")).data.work, work);
    });

    test("handing in needs the assignment to be published, and the teacher sees the handed-in copy", async () => {
        const own = (await student("POST", "/projects", project("Not an assignment"))).data.project;
        await student("PUT", `/work/${own.id}`, { work: { start: "", model: "", steps: "", graphs: [], media: [] }, version: 0 });
        assert.equal((await student("POST", `/work/${own.id}/submit`, { version: 1 })).data.error, "not_published");

        const handedIn = await student("POST", "/work/standard-freefall/submit", { version: 1 });
        assert.equal(handedIn.status, 200);
        const seen = await teacher("GET", `/classes/${classId}/students/${studentId}/work/standard-freefall`);
        assert.equal(seen.data.submission.work.model, "stop als t >= 1\n");
    });

    test("an assignment can open later and have a due date; hand-ins after it are late", async () => {
        const hour = 60 * 60 * 1000;
        const later = { instructions: "Work in pairs", opensAt: Date.now() + hour, dueAt: Date.now() + 2 * hour };
        assert.equal((await teacher("PUT", "/projects/standard-freefall/classes", {
            classIds: [classId], settings: { [classId]: { ...later, dueAt: later.opensAt } },
        })).data.error, "invalid_assignment");

        // Not open yet: students don't see it or can't work on it; the teacher sees the settings
        const saved = await teacher("PUT", "/projects/standard-freefall/classes", { classIds: [classId], settings: { [classId]: later } });
        assert.deepEqual(saved.data.classes.map(({ instructions, opensAt, dueAt }) => ({ instructions, opensAt, dueAt })), [later]);
        assert.ok(!(await student("GET", "/projects")).data.projects.some((p) => p.id === "standard-freefall"));
        assert.equal((await student("POST", "/work/standard-freefall/submit", { version: 1 })).data.error, "not_published");

        // Open, and already past its due date: handing in still works but counts as late
        const overdue = { instructions: "Work in pairs", opensAt: Date.now() - 2 * hour, dueAt: Date.now() - hour };
        await teacher("PUT", "/projects/standard-freefall/classes", { classIds: [classId], settings: { [classId]: overdue } });
        const published = (await student("GET", "/projects/published")).data.published["standard-freefall"];
        assert.equal(published[0].dueAt, overdue.dueAt);
        assert.equal(published[0].instructions, "Work in pairs");
        assert.equal((await student("POST", "/work/standard-freefall/submit", { version: 1 })).status, 200);

        const progress = (await teacher("GET", `/classes/${classId}/progress`)).data.projects;
        const freefall = progress.find((p) => p.projectId === "standard-freefall");
        assert.equal(freefall.dueAt, overdue.dueAt);
        assert.equal(freefall.students.find((s) => s.id === studentId).late, true);

        const handIns = (await teacher("GET", "/classes/hand-ins")).data.handIns;
        assert.deepEqual(handIns.map((h) => [h.studentId, h.projectId, h.late]), [[studentId, "standard-freefall", true]]);
        assert.equal((await student("GET", "/classes/hand-ins")).status, 403);
    });

    test("teachers return, approve and mark hand-ins; students see it and can't take a reviewed hand-in back", async () => {
        const url = `/classes/${classId}/students/${studentId}/work/standard-freefall/feedback`;
        assert.equal((await teacher("PUT", url, { status: "approved", mark: 11 })).status, 400);
        assert.equal((await student("PUT", url, { status: "approved" })).status, 403);

        const returned = await teacher("PUT", url, { status: "returned", feedback: "Check your units", mark: 7.46 });
        assert.equal(returned.status, 200);
        const seen = (await student("GET", "/work/standard-freefall")).data.submission;
        assert.deepEqual([seen.status, seen.feedback, seen.mark, seen.reviewedBy], ["returned", "Check your units", 7.5, "Teacher Three"]);
        assert.equal((await student("DELETE", "/work/standard-freefall/submission")).data.error, "already_reviewed");
        assert.equal((await student("GET", "/work")).data.work.find((w) => w.projectId === "standard-freefall").status, "returned");

        // Handing in again puts it back to "handed in"; the comment stays until the teacher changes it
        const version = (await student("GET", "/work/standard-freefall")).data.version;
        const again = await student("POST", "/work/standard-freefall/submit", { version });
        assert.deepEqual([again.data.submission.status, again.data.submission.feedback], ["handed_in", "Check your units"]);

        await teacher("PUT", url, { status: "approved", feedback: "Well done", mark: 8 });
        const progress = (await teacher("GET", `/classes/${classId}/progress`)).data.projects;
        const row = progress.find((p) => p.projectId === "standard-freefall").students.find((s) => s.id === studentId);
        assert.deepEqual([row.status, row.mark], ["approved", 8]);
    });

    test("students see their classes with teachers and assignments, and can leave one", async () => {
        assert.equal((await teacher("GET", "/classes/mine")).status, 403);
        const [mine] = (await student("GET", "/classes/mine")).data.classes;
        assert.equal(mine.name, "5V natuurkunde");
        assert.deepEqual(mine.teachers, ["Teacher Three"]);
        assert.deepEqual(mine.assignments.map((a) => a.id), ["standard-freefall"]);

        const left = await student("DELETE", `/classes/mine/${classId}`);
        assert.deepEqual(left.data.user.classes, []);
        assert.deepEqual((await student("GET", "/classes/mine")).data.classes, []);
        assert.ok(!(await student("GET", "/projects")).data.projects.some((p) => p.id === "standard-freefall"));
        assert.equal((await teacher("GET", `/classes/${classId}/students/${studentId}/work/standard-freefall`)).status, 404);
        assert.equal((await student("DELETE", `/classes/mine/${classId}`)).status, 404);
    });

    test("a teacher can delete a student's account from the class, with all their work", async () => {
        const before = await teacher("GET", `/classes/${classId}`);
        const b = before.data.class.students.find((s) => s.email === "b@school.test");
        assert.equal((await classmate("DELETE", `/classes/${classId}/students/${b.id}/account`)).status, 403);
        const res = await teacher("DELETE", `/classes/${classId}/students/${b.id}/account`);
        assert.equal(res.status, 200);
        assert.ok(!res.data.class.students.some((s) => s.id === b.id));
        assert.equal((await classmate("GET", "/auth/me")).data.user, null);
    });

    test("deleting your own account takes the password; a class's only teacher hands it over first", async () => {
        assert.equal((await student("DELETE", "/auth/me", { password: "wrong-password" })).status, 403);
        assert.equal((await student("DELETE", "/auth/me", { password: PASSWORD })).status, 200);
        assert.equal((await student("GET", "/auth/me")).data.user, null);
        assert.equal((await client()("POST", "/auth/login", { email: "a@school.test", password: PASSWORD })).status, 401);

        const blocked = await teacher("DELETE", "/auth/me", { password: PASSWORD });
        assert.equal(blocked.status, 409);
        assert.deepEqual(blocked.data.classes, ["5V natuurkunde"]);
    });
});

describe("administration and your own data", () => {
    const admin = client();
    const teacher = client();
    const student = client();
    let classCode;

    before(async () => {
        await signUp(admin, teacherInvite(), "Admin", "admin@school.test");
        execFileSync("node", ["make-admin.js", "admin@school.test"], { cwd: serverDir, env });
        await signUp(teacher, teacherInvite(), "Teacher Four", "four@school.test");
        classCode = (await teacher("POST", "/classes", { name: "4H" })).data.class.code;
        await signUp(student, classCode, "Student C", "c@school.test");
    });

    test("only administrators reach the administration API", async () => {
        assert.equal((await teacher("GET", "/admin/users")).status, 403);
        assert.equal((await admin("GET", "/auth/me")).data.user.isAdmin, true);
        const found = await admin("GET", "/admin/users?q=school.test");
        assert.ok(found.data.users.some((u) => u.email === "c@school.test" && u.role === "student"));
        assert.deepEqual((await admin("GET", "/admin/users?q=Four")).data.users.map((u) => u.email), ["four@school.test"]);
    });

    test("teacher invitations are made and revoked in the app", async () => {
        assert.equal((await admin("POST", "/admin/invites", { uses: 2, days: 7 })).data.error, "school_required");
        const [school] = (await admin("GET", "/admin/schools")).data.schools;
        const made = await admin("POST", "/admin/invites", { uses: 2, days: 7, schoolId: school.id });
        assert.equal(made.status, 201);
        assert.equal((await client()("POST", "/auth/code", { code: made.data.code })).data.kind, "teacher");
        assert.ok(made.data.invites.some((i) => i.code === made.data.code && i.usesLeft === 2));
        await admin("DELETE", `/admin/invites/${made.data.code}`);
        assert.equal((await client()("POST", "/auth/code", { code: made.data.code })).data.error, "invalid_code");
    });

    test("a deactivated account is signed out and can't sign in until it's reactivated", async () => {
        const id = (await admin("GET", "/admin/users?q=c@school.test")).data.users[0].id;
        assert.equal((await admin("PATCH", `/admin/users/${id}`, { disabled: true })).data.user.disabled, true);
        assert.equal((await student("GET", "/auth/me")).data.user, null);
        const login = await student("POST", "/auth/login", { email: "c@school.test", password: PASSWORD });
        assert.deepEqual([login.status, login.data.error], [403, "account_disabled"]);
        await admin("PATCH", `/admin/users/${id}`, { disabled: false });
        assert.equal((await student("POST", "/auth/login", { email: "c@school.test", password: PASSWORD })).status, 200);

        // A reset code from an administrator works like a teacher's
        const reset = await admin("POST", `/admin/users/${id}/reset`);
        assert.equal((await client()("POST", "/auth/reset/check", { code: reset.data.code })).data.email, "c@school.test");
    });

    test("roles change with their classes; administrators can't change themselves", async () => {
        const me = (await admin("GET", "/auth/me")).data.user.id;
        assert.equal((await admin("PATCH", `/admin/users/${me}`, { isAdmin: false })).data.error, "cannot_change_self");
        const teacherId = (await teacher("GET", "/auth/me")).data.user.id;
        const demoted = await admin("PATCH", `/admin/users/${teacherId}`, { role: "student" });
        assert.deepEqual([demoted.status, demoted.data.classes], [409, ["4H"]]);

        const studentId = (await student("GET", "/auth/me")).data.user.id;
        const promoted = await admin("PATCH", `/admin/users/${studentId}`, { role: "teacher" });
        assert.equal(promoted.data.user.role, "teacher");
        assert.deepEqual((await student("GET", "/auth/me")).data.user.classes, []);
    });

    test("everyone can download what's stored about them", async () => {
        await student("PUT", "/work/standard-freefall", { work: { start: "t = 0\n", model: "", steps: "", graphs: [], media: [] }, version: 0 });
        const res = await student("GET", "/auth/me/export");
        assert.equal(res.data.account.email, "c@school.test");
        assert.ok(res.data.sessions.length >= 1);
        assert.ok(Array.isArray(res.data.classes));
        assert.ok(Array.isArray(res.data.uploadedFiles));
    });

    test("administrators can delete accounts", async () => {
        const id = (await admin("GET", "/admin/users?q=c@school.test")).data.users[0].id;
        assert.equal((await admin("DELETE", `/admin/users/${id}`)).status, 200);
        assert.deepEqual((await admin("GET", "/admin/users?q=c@school.test")).data.users, []);
    });
});

describe("schools", () => {
    const admin = client();
    const teacherA = client();
    const teacherB = client();
    let classA;

    before(async () => {
        await signUp(admin, teacherInvite(), "Admin Two", "admin2@a.test");
        execFileSync("node", ["make-admin.js", "admin2@a.test"], { cwd: serverDir, env });
        await signUp(teacherA, teacherInvite(), "Teacher A", "teacher@a.test");
        await signUp(teacherB, teacherInvite("Other School"), "Teacher B", "teacher@b.test");
        classA = (await teacherA("POST", "/classes", { name: "5V" })).data.class;
    });

    test("accounts belong to the school of their invitation or class", async () => {
        const [a, b] = await Promise.all([teacherA("GET", "/auth/me"), teacherB("GET", "/auth/me")]);
        assert.equal(b.data.user.school.name, "Other School");
        assert.notEqual(a.data.user.school.id, b.data.user.school.id);
        const student = client();
        const joined = await signUp(student, classA.code, "Student A", "student@a.test");
        assert.equal(joined.school.id, a.data.user.school.id);
    });

    test("teachers only see co-teaching invitations from their own school", async () => {
        await teacherA("POST", `/classes/${classA.id}/teachers`, { email: "teacher@b.test" });
        assert.deepEqual((await teacherB("GET", "/classes/invitations")).data.invitations, []);
        assert.equal((await teacherB("POST", `/classes/invitations/${classA.id}/accept`)).status, 404);
    });

    test("students can't join a class of another school", async () => {
        const classB = (await teacherB("POST", "/classes", { name: "B1" })).data.class;
        const student = client();
        await student("POST", "/auth/login", { email: "student@a.test", password: PASSWORD });
        const res = await student("POST", "/classes/join", { code: classB.code });
        assert.deepEqual([res.status, res.data.error], [403, "other_school"]);
    });

    test("administrators manage schools and move accounts that are in no classes", async () => {
        const made = await admin("POST", "/admin/schools", { name: "Third School" });
        assert.equal(made.status, 201);
        assert.equal((await admin("POST", "/admin/schools", { name: "third school" })).data.error, "school_exists");
        const third = made.data.schools.find((s) => s.name === "Third School");
        assert.equal((await admin("PATCH", `/admin/schools/${third.id}`, { name: "3rd School" })).status, 200);

        const teacherBId = (await teacherB("GET", "/auth/me")).data.user.id;
        assert.equal((await admin("PATCH", `/admin/users/${teacherBId}`, { schoolId: third.id })).data.error, "has_classes");
        const invite = await admin("POST", "/admin/invites", { uses: 1, days: 7, schoolId: third.id });
        assert.equal(invite.data.invites.find((i) => i.code === invite.data.code).school, "3rd School");
        const newTeacher = await signUp(client(), invite.data.code, "Teacher C", "teacher@c.test");
        assert.equal(newTeacher.school.name, "3rd School");

        // A school is only deleted once nothing belongs to it
        assert.equal((await admin("DELETE", `/admin/schools/${third.id}`)).data.error, "school_in_use");
        const other = (await admin("GET", "/admin/schools")).data.schools.find((s) => s.name === "Other School");
        assert.equal((await admin("PATCH", `/admin/users/${newTeacher.id}`, { schoolId: other.id })).data.user.school.name, "Other School");
        const left = (await admin("DELETE", `/admin/schools/${third.id}`)).data.schools;
        assert.equal(left.some((s) => s.id === third.id), false);
    });
});
