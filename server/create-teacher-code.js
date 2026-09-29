import db from "./db.js";
import { formatCode, generateCode } from "./codes.js";

// Teacher accounts are the only ones bootstrapped from the command line;
// students join through the class codes teachers create in the app.
const uses = Number(process.argv[2] ?? "1");
if (!Number.isInteger(uses) || uses < 1) {
    console.error("Usage: node create-teacher-code.js [uses]");
    process.exit(1);
}

const code = generateCode();
db.prepare("INSERT INTO teacher_invites (code, uses_left) VALUES (?, ?)").run(code, uses);
console.log(`${formatCode(code)}  (teacher invitation, ${uses} use${uses === 1 ? "" : "s"})`);
