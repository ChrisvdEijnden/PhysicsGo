// Media files (videos, images) added to projects, kept on this device until the server has them
// (see lib/workSync). They're too large for localStorage, so they live in IndexedDB; the rest of the
// project (points, settings) refers to a file by its key. Keys start with the account's storage scope.

import { storageScope } from "./storageScope";

const DB_NAME = "physicsgo";
const STORE = "media";

let dbPromise: Promise<IDBDatabase> | null = null;
// Moving files saved before keys were per account; reads and writes wait for it
let adoption: Promise<void> = Promise.resolve();

function openDb(): Promise<IDBDatabase> {
    dbPromise ??= new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    // A failed open (e.g. storage disabled) shouldn't stop later attempts
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    await adoption;
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const request = action(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
    });
}

export const mediaKey = (projectId: string, mediaId: string) => `${storageScope()}/${projectId}/${mediaId}`;

export function saveMediaFile(key: string, file: Blob): Promise<void> {
    return withStore("readwrite", (store) => store.put(file, key));
}

export function loadMediaFile(key: string): Promise<Blob | undefined> {
    return withStore("readonly", (store) => store.get(key));
}

export function deleteMediaFile(key: string): Promise<void> {
    return withStore("readwrite", (store) => store.delete(key));
}

// The keys of the files one account (`scope`) keeps on this device
export async function scopeMediaKeys(scope: string): Promise<string[]> {
    const keys = await withStore<IDBValidKey[]>("readonly", (store) => store.getAllKeys(IDBKeyRange.bound(`${scope}/`, `${scope}/￿`)))
        .catch(() => [] as IDBValidKey[]);
    return keys.map(String);
}

// Removes every file one account (`scope`) kept on this device, e.g. when the account is deleted
export async function deleteScopeMedia(scope: string): Promise<void> {
    await withStore("readwrite", (store) => store.delete(IDBKeyRange.bound(`${scope}/`, `${scope}/\uffff`)))
        .catch(() => undefined);
}

// Files saved before keys included an account ("<project>/<media>") move to `scope`
export function adoptLegacyMedia(scope: string) {
    adoption = openDb().then((db) => new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        store.openCursor().onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
            if (!cursor) return;
            const key = String(cursor.key);
            if (key.split("/").length === 2) {
                store.put(cursor.value, `${scope}/${key}`);
                cursor.delete();
            }
            cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    })).catch(() => {
        // Storage can be unavailable; the files then stay where they were
    });
}
