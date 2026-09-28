import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export interface AuthUser {
    name: string;
    class: string;
    email: string;
}

export type AuthResult = { ok: true } | { ok: false; error: string };

interface ApiData {
    error?: string;
    user?: AuthUser | null;
}

interface AuthContextValue {
    user: AuthUser | null;
    loading: boolean;
    checkCode: (code: string) => Promise<AuthResult>;
    register: (input: { code: string; name: string; email: string; password: string }) => Promise<AuthResult>;
    login: (email: string, password: string) => Promise<AuthResult>;
    logout: () => Promise<void>;
    updateUser: (patch: Partial<AuthUser>) => Promise<AuthResult>;
}

async function api(path: string, method = "GET", body?: unknown): Promise<{ ok: boolean; data: ApiData }> {
    try {
        const res = await fetch(`/api${path}`, {
            method,
            headers: body ? { "Content-Type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 429) return { ok: false, data: { error: "rate_limited" } };
        const data: ApiData = await res.json().catch(() => ({}));
        return { ok: res.ok, data };
    } catch {
        return { ok: false, data: { error: "network" } };
    }
}

const toResult = ({ ok, data }: { ok: boolean; data: ApiData }): AuthResult =>
    ok ? { ok: true } : { ok: false, error: data.error ?? "server_error" };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api("/auth/me").then(({ data }) => {
            setUser(data.user ?? null);
            setLoading(false);
        });
    }, []);

    const checkCode = useCallback(
        async (code: string) => toResult(await api("/auth/code", "POST", { code })),
        []
    );

    const register = useCallback(
        async (input: { code: string; name: string; email: string; password: string }) => {
            const res = await api("/auth/register", "POST", input);
            if (res.ok) setUser(res.data.user ?? null);
            return toResult(res);
        },
        []
    );

    const login = useCallback(async (email: string, password: string) => {
        const res = await api("/auth/login", "POST", { email, password });
        if (res.ok) setUser(res.data.user ?? null);
        return toResult(res);
    }, []);

    const logout = useCallback(async () => {
        await api("/auth/logout", "POST");
        setUser(null);
    }, []);

    const updateUser = useCallback(async (patch: Partial<AuthUser>) => {
        const res = await api("/auth/me", "PATCH", patch);
        if (res.ok) setUser(res.data.user ?? null);
        return toResult(res);
    }, []);

    const value = useMemo(
        () => ({ user, loading, checkCode, register, login, logout, updateUser }),
        [user, loading, checkCode, register, login, logout, updateUser]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}