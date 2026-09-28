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
};

export const authErrorKey = (error: string): TranslationKey => MAP[error] ?? "auth.errGeneric";