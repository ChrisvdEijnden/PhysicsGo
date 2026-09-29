import db from "./db.js";

// Promotes an existing account to teacher, e.g. one created before teacher invitations existed
const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
    console.error("Usage: node make-teacher.js <email>");
    process.exit(1);
}

const tx = db.transaction(() => {
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (!user) return false;
    db.prepare("UPDATE users SET role = 'teacher' WHERE id = ?").run(user.id);
    db.prepare("DELETE FROM class_students WHERE user_id = ?").run(user.id);
    return true;
});

if (!tx()) {
    console.error(`No account with email ${email}`);
    process.exit(1);
}
console.log(`${email} is now a teacher`);
