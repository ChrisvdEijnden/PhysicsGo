import type { TranslationKey } from "./Translations";

const MAP: Record<string, TranslationKey> = {
    invalid_credentials: "auth.errInvalidCredentials",
    invalid_code: "login.invalidCode",
    invalid_name: "auth.errInvalidName",
    invalid_email: "auth.errInvalidEmail",
    weak_password: "auth.errWeakPassword",
    password_mismatch: "auth.errMismatch",
    email_taken: "auth.errEmailTaken",
    rate_limited: "auth.errRateLimit",
    network: "auth.errNetwork",
    code_expired: "code.errExpired",
    class_closed: "code.errClassClosed",
    already_member: "code.errAlreadyMember",
    teachers_cannot_join: "code.errTeacherCannotJoin",
    invalid_class_name: "classes.errName",
    user_not_found: "classes.errUserNotFound",
    not_a_teacher: "classes.errNotTeacher",
    already_teacher: "classes.errAlreadyTeacher",
    last_teacher: "classes.errLastTeacher",
    not_found: "classes.errNotFound",
    forbidden: "classes.errForbidden",
};

export const authErrorKey = (error: string): TranslationKey => MAP[error] ?? "auth.errGeneric";