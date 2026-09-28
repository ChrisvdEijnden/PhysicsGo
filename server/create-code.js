import crypto from "node:crypto";
import db from "./db.js";

const [cls, uses = "1"] = process.argv.slice(2);
if (!cls) {
    console.error("Usage: node create-code.js <class> [uses]");
    process.exit(1);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = Array.from({ length: 12 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");

db.prepare("INSERT INTO invite_codes (code, class, uses_left) VALUES (?, ?, ?)").run(code, cls, Number(uses));
console.log(`${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}  (class ${cls}, ${uses} uses)`);