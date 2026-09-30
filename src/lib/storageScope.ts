// Work kept in this browser is stored per account, so people sharing a computer never see or
// overwrite each other's projects. The scope follows the signed-in user (see data/Projects).
let scope: string | null = null;

export const storageScope = () => scope;

// Returns whether the scope changed
export function setStorageScope(userId: number | null): boolean {
    const next = userId === null ? null : `u${userId}`;
    if (next === scope) return false;
    scope = next;
    return true;
}
