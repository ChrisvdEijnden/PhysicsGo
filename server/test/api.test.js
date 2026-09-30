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

function teacherInvite() {
    return execFileSync("node", ["create-teacher-code.js", "5"], { cwd: serverDir, env }).toString().split(" ")[0];
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
        assert.deepEqual((await student("GET", "/projects")).data.projects.map((p) => p.id), ["standard-freefall"]);
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
