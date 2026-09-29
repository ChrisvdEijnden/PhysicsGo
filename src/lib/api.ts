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
        return { ok: res.ok, data };
    } catch {
        return { ok: false, data: { error: "network" } as Partial<T> & { error: string } };
    }
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const errorOf = (data: { error?: string }) => data.error ?? "server_error";
