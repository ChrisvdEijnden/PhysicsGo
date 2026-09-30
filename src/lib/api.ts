// Told when the server says the session is gone (expired after being idle, or ended from another
// device) while someone was using the app, so it can ask them to sign in again without leaving the page
const sessionEndedListeners = new Set<() => void>();

export function onSessionEnded(listener: () => void) {
    sessionEndedListeners.add(listener);
    return () => {
        sessionEndedListeners.delete(listener);
    };
}

export function reportSessionEnded() {
    sessionEndedListeners.forEach((listener) => listener());
}

export interface ApiResponse<T> {
    ok: boolean;
    data: T & { error?: string };
}

export async function api<T = Record<string, unknown>>(
    path: string,
    method = "GET",
    body?: unknown
): Promise<ApiResponse<Partial<T>>> {
    try {
        const res = await fetch(`/api${path}`, {
            method,
            headers: body ? { "Content-Type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 429) return { ok: false, data: { error: "rate_limited" } as Partial<T> & { error: string } };
        const data = await res.json().catch(() => ({}));
        // Other 401s (a wrong password when signing in) are ordinary errors
        if (res.status === 401 && data.error === "unauthenticated") reportSessionEnded();
        return { ok: res.ok, data };
    } catch {
        return { ok: false, data: { error: "network" } as Partial<T> & { error: string } };
    }
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const errorOf = (data: { error?: string }) => data.error ?? "server_error";
