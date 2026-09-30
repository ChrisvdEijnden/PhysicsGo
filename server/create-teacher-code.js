import db from "./db.js";
import { formatCode, generateCode } from "./codes.js";
import { resolveSchool, validSchoolName } from "./schools.js";

// Teacher accounts are the only ones bootstrapped from the command line; students join through the
// class codes teachers create in the app. The invitation is for a school: the one named (made if it
// doesn't exist yet), or when there's only one school (or none yet), that one.
const uses = Number(process.argv[2] ?? "1");
const schoolName = process.argv[3] === undefined ? null : validSchoolName(process.argv[3]);
if (!Number.isInteger(uses) || uses < 1 || (process.argv[3] !== undefined && !schoolName)) {
    console.error('Usage: node create-teacher-code.js [uses] ["school name"]');
    process.exit(1);
}
const schoolId = resolveSchool(schoolName);
if (!schoolId) {
    console.error('There are several schools; say which: node create-teacher-code.js [uses] "school name"');
    process.exit(1);
}
const school = db.prepare("SELECT name FROM schools WHERE id = ?").get(schoolId).name;

const code = generateCode();
db.prepare("INSERT INTO teacher_invites (code, uses_left, created_at, school_id) VALUES (?, ?, ?, ?)").run(code, uses, Date.now(), schoolId);
console.log(`${formatCode(code)}  (teacher invitation for ${school}, ${uses} use${uses === 1 ? "" : "s"})`);
