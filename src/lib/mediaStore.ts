// Media files (videos, images) added to projects, kept on this device. They're too large for
// localStorage, so they live in IndexedDB; the rest of the project (points, settings) stays in
// localStorage and refers to a file by its key.

const DB_NAME = "physicsgo";
const STORE = "media";

let dbPromise: Promise<IDBDatabase> | null = null;

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
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const request = action(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
    });
}

export const mediaKey = (projectId: string, mediaId: string) => `${projectId}/${mediaId}`;

export function saveMediaFile(key: string, file: Blob): Promise<void> {
    return withStore("readwrite", (store) => store.put(file, key));
}

export function loadMediaFile(key: string): Promise<Blob | undefined> {
    return withStore("readonly", (store) => store.get(key));
}

export function deleteMediaFile(key: string): Promise<void> {
    return withStore("readwrite", (store) => store.delete(key));
}
