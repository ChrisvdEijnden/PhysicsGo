import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, errorOf } from "./api";
import type { Result } from "./api";

export type Role = "student" | "teacher";

export interface ClassRef {
    id: number;
    name: string;
}

export interface AuthUser {
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
    updateUser: (patch: Partial<Pick<AuthUser, "name" | "email">>) => Promise<AuthResult>;
    joinClass: (code: string) => Promise<Result<{ joined: ClassRef }>>;
    refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const { data } = await api<UserData>("/auth/me");
        setUser(data.user ?? null);
    }, []);

    useEffect(() => {
        refresh().then(() => setLoading(false));
    }, [refresh]);

    // Shared by every call that returns the updated account
    const withUser = useCallback(async (res: Promise<{ ok: boolean; data: UserData & { error?: string } }>) => {
        const { ok, data } = await res;
        if (!ok) return { ok: false as const, error: errorOf(data) };
        setUser(data.user ?? null);
        return { ok: true as const };
    }, []);

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
        setUser(null);
    }, []);

    const updateUser = useCallback(
        (patch: Partial<Pick<AuthUser, "name" | "email">>) => withUser(api<UserData>("/auth/me", "PATCH", patch)),
        [withUser]
    );

    const joinClass = useCallback(async (code: string): Promise<Result<{ joined: ClassRef }>> => {
        const { ok, data } = await api<UserData & { class: ClassRef }>("/classes/join", "POST", { code });
        if (!ok || !data.class) return { ok: false, error: errorOf(data) };
        setUser(data.user ?? null);
        return { ok: true, joined: data.class };
    }, []);

    const value = useMemo(
        () => ({ user, loading, checkCode, register, login, logout, updateUser, joinClass, refresh }),
        [user, loading, checkCode, register, login, logout, updateUser, joinClass, refresh]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}
