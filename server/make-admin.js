import db from "./db.js";

// Makes an account an administrator, for the first one; after that, administrators manage each
// other on the Administration page. `--remove` takes it away again.
const [email = "", flag] = process.argv.slice(2).map((a) => a.trim());
if (!email || (flag && flag !== "--remove")) {
    console.error("Usage: node make-admin.js <email> [--remove]");
    process.exit(1);
}

const result = db.prepare("UPDATE users SET is_admin = ? WHERE email = ?").run(flag ? 0 : 1, email.toLowerCase());
if (result.changes === 0) {
    console.error(`No account with email ${email}`);
    process.exit(1);
}
console.log(flag ? `${email} is no longer an administrator` : `${email} is now an administrator`);
