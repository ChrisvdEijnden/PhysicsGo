import db from "./db.js";
import { createReset } from "./resets.js";

// Prints a one-time code for setting a new password, e.g. for a teacher who forgot theirs.
// Students get theirs from a teacher on the Classes page.
const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
    console.error("Usage: node reset-password.js <email>");
    process.exit(1);
}

const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
if (!user) {
    console.error(`No account with email ${email}`);
    process.exit(1);
}
const { code, expiresAt } = createReset(user.id, null);
console.log(`${code}  (reset code for ${email}, valid until ${new Date(expiresAt).toLocaleString()})`);
console.log("Enter it via \"Forgot your password?\" on the login page.");
