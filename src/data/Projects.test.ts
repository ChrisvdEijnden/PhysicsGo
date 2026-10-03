import { beforeEach, describe, expect, it } from "vitest";

import { forgetSavedWork, loadProjectWork, saveProjectWork, saveSyncState, setStorageUser } from "./Projects";
import type { ProjectWork } from "./Projects";

// The tests run without a browser; this stands in for its localStorage
class MemoryStorage {
    private items = new Map<string, string>();
    get length() {
        return this.items.size;
    }
    key(i: number) {
        return [...this.items.keys()][i] ?? null;
    }
    getItem(key: string) {
        return this.items.get(key) ?? null;
    }
    setItem(key: string, value: string) {
        this.items.set(key, value);
    }
    removeItem(key: string) {
        this.items.delete(key);
    }
    clear() {
        this.items.clear();
    }
}
const storage = new MemoryStorage();
Object.assign(globalThis, { localStorage: storage });

const work = (model: string): ProjectWork => ({ start: "t = 0\n", model, steps: "", graphs: [], media: [] });

describe("this browser's copy of work", () => {
    beforeEach(() => {
        storage.clear();
        setStorageUser(null);
    });

    it("keeps only what the server hasn't got once the account's saved work is forgotten", () => {
        setStorageUser(1);
        saveProjectWork("saved", work("a"));
        saveSyncState("saved", { version: 2, dirty: false });
        saveProjectWork("unsaved", work("b"));
        saveSyncState("unsaved", { version: 1, dirty: true });
        // Saved in this browser before work went to the server: never sent yet
        saveProjectWork("older", work("c"));

        forgetSavedWork("u1");
        expect(loadProjectWork("saved")).toBeNull();
        expect(loadProjectWork("unsaved")?.model).toBe("b");
        expect(loadProjectWork("older")?.model).toBe("c");
    });

    it("removes nothing of an account that has everything saved but the keys themselves", () => {
        setStorageUser(1);
        saveProjectWork("saved", work("a"));
        saveSyncState("saved", { version: 2, dirty: false });
        forgetSavedWork("u1");
        expect(storage.length).toBe(0);
    });

    it("removes the saved work of earlier accounts when someone else signs in", () => {
        setStorageUser(1);
        saveProjectWork("saved", work("a"));
        saveSyncState("saved", { version: 2, dirty: false });
        saveProjectWork("unsaved", work("b"));
        saveSyncState("unsaved", { version: 1, dirty: true });

        // Account 1 closed the browser without signing out; account 2 signs in
        setStorageUser(2);
        expect(loadProjectWork("saved")).toBeNull();
        expect(loadProjectWork("unsaved")).toBeNull();

        // Account 1's unsaved change is still there for when it signs in again
        setStorageUser(1);
        expect(loadProjectWork("saved")).toBeNull();
        expect(loadProjectWork("unsaved")?.model).toBe("b");
    });
});
