import crypto from "node:crypto";
import db from "./db.js";

// No 0/O, 1/I: codes are read aloud and copied from a projector
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 12;

export const normalizeCode = (c) =>
    (typeof c === "string" ? c : "").replace(/[\s-]/g, "").toUpperCase();

export const formatCode = (code) => code.match(/.{1,4}/g).join("-");

const inUse = db.prepare(`
    SELECT 1 FROM classes WHERE code = @code
    UNION ALL SELECT 1 FROM retired_class_codes WHERE code = @code
    UNION ALL SELECT 1 FROM teacher_invites WHERE code = @code
`);

// Every code is unique across class codes (current and retired) and teacher invitations
export function generateCode() {
    for (;;) {
        const code = Array.from({ length: CODE_LENGTH }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");
        if (!inUse.get({ code })) return code;
    }
}
