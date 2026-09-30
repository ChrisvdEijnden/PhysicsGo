import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, errorOf } from "./api";
import type { Result } from "./api";
import { setStorageUser } from "../data/Projects";
import { syncLocalWork } from "./workSync";

export type Role = "student" | "teacher";

export interface ClassRef {
    id: number;
    name: string;
}

export interface AuthUser {
    id: number;
    name: string;
    email: string;
    role: Role;
    classes: ClassRef[];
}

export type AuthResult = Result;

// What an enrollment code unlocks at registration
export type CodeInfo = { kind: "class"; className: string } | { kind: "teacher" };

interface UserData {
    user?: AuthUser | null;
}

interface AuthContextValue {
    user: AuthUser | null;
    loading: boolean;
    checkCode: (code: string) => Promise<Result<{ info: CodeInfo }>>;
    register: (input: { code: string; name: string; email: string; password: string }) => Promise<AuthResult>;
    login: (email: string, password: string) => Promise<AuthResult>;
    logout: () => Promise<void>;
    // Changing the email needs the account's current password
    updateUser: (patch: Partial<Pick<AuthUser, "name" | "email">> & { currentPassword?: string }) => Promise<AuthResult>;
    joinClass: (code: string) => Promise<Result<{ joined: ClassRef }>>;
    // A reset code from a teacher: whose account it is, then a new password (which also signs in)
    checkResetCode: (code: string) => Promise<Result<{ account: { name: string; email: string } }>>;
    resetPassword: (code: string, password: string) => Promise<AuthResult>;
    refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    // Work saved in this browser is per account, so it switches before anything renders for the new user
    const applyUser = useCallback((next: AuthUser | null) => {
        setStorageUser(next?.id ?? null);
        setUser(next);
    }, []);

    const refresh = useCallback(async () => {
        const { data } = await api<UserData>("/auth/me");
        applyUser(data.user ?? null);
    }, [applyUser]);

    useEffect(() => {
        refresh().then(() => setLoading(false));
    }, [refresh]);

    // Work this browser has that the server hasn't (made offline, or from before work was saved online)
    // is sent after signing in and whenever the connection comes back
    const userId = user?.id ?? null;
    useEffect(() => {
        if (userId === null) return;
        syncLocalWork();
        window.addEventListener("online", syncLocalWork);
        return () => window.removeEventListener("online", syncLocalWork);
    }, [userId]);

    // Shared by every call that returns the updated account
    const withUser = useCallback(async (res: Promise<{ ok: boolean; data: UserData & { error?: string } }>) => {
        const { ok, data } = await res;
        if (!ok) return { ok: false as const, error: errorOf(data) };
        applyUser(data.user ?? null);
        return { ok: true as const };
    }, [applyUser]);

    const checkCode = useCallback(async (code: string): Promise<Result<{ info: CodeInfo }>> => {
        const { ok, data } = await api<{ kind: CodeInfo["kind"]; className: string | null }>(
            "/auth/code", "POST", { code }
        );
        if (!ok) return { ok: false, error: errorOf(data) };
        const info: CodeInfo = data.kind === "teacher"
            ? { kind: "teacher" }
            : { kind: "class", className: data.className ?? "" };
        return { ok: true, info };
    }, []);

    const register = useCallback(
        (input: { code: string; name: string; email: string; password: string }) =>
            withUser(api<UserData>("/auth/register", "POST", input)),
        [withUser]
    );

    const login = useCallback(
        (email: string, password: string) => withUser(api<UserData>("/auth/login", "POST", { email, password })),
        [withUser]
    );

    const logout = useCallback(async () => {
        await api("/auth/logout", "POST");
        applyUser(null);
    }, [applyUser]);

    const updateUser = useCallback(
        (patch: Partial<Pick<AuthUser, "name" | "email">> & { currentPassword?: string }) =>
            withUser(api<UserData>("/auth/me", "PATCH", patch)),
        [withUser]
    );

    const joinClass = useCallback(async (code: string): Promise<Result<{ joined: ClassRef }>> => {
        const { ok, data } = await api<UserData & { class: ClassRef }>("/classes/join", "POST", { code });
        if (!ok || !data.class) return { ok: false, error: errorOf(data) };
        applyUser(data.user ?? null);
        return { ok: true, joined: data.class };
    }, [applyUser]);

    const checkResetCode = useCallback(async (code: string): Promise<Result<{ account: { name: string; email: string } }>> => {
        const { ok, data } = await api<{ name: string; email: string }>("/auth/reset/check", "POST", { code });
        if (!ok || !data.email) return { ok: false, error: errorOf(data) };
        return { ok: true, account: { name: data.name ?? "", email: data.email } };
    }, []);

    const resetPassword = useCallback(
        (code: string, password: string) => withUser(api<UserData>("/auth/reset", "POST", { code, password })),
        [withUser]
    );

    const value = useMemo(
        () => ({ user, loading, checkCode, register, login, logout, updateUser, joinClass, checkResetCode, resetPassword, refresh }),
        [user, loading, checkCode, register, login, logout, updateUser, joinClass, checkResetCode, resetPassword, refresh]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}
