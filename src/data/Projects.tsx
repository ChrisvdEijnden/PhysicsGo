import { setStorageScope, storageScope } from "../lib/storageScope";
import { adoptLegacyMedia } from "../lib/mediaStore";

// A project as the server sends it: a built-in preset or one a teacher wrote
export interface Project {
    id: string;
    title: string;
    explanation: string;
    // Starter code; null means the default start values and model rules
    start: string | null;
    model: string | null;
    estimatedTime: number | null; // in minutes
    equipment: string[];
    curriculum: boolean;
    builtIn: boolean;
    // Written by the signed-in teacher, who can edit it
    mine: boolean;
    updatedAt: number;
}

// This browser's copy of each project's work (the server has the real one, see lib/workSync),
// under keys that include the signed-in account (see lib/storageScope)
const WORK_KEY = "physicsgo_project_work";
// Per project: the server version the local copy is based on, and whether it has unsaved changes
const SYNC_KEY = "physicsgo_project_sync";

const scoped = (key: string) => `${key}:${storageScope()}`;

function readStore<T>(key: string): Record<string, T> {
    try {
        const stored = JSON.parse(localStorage.getItem(key) ?? "{}");
        return stored && typeof stored === "object" ? stored : {};
    } catch {
        return {};
    }
}

function writeStore<T>(key: string, id: string, value: T) {
    try {
        localStorage.setItem(key, JSON.stringify({ ...readStore<T>(key), [id]: value }));
    } catch {
        // Storage can be unavailable; the change then lasts until the app reloads
    }
}

// Work saved before it was kept per account goes to whoever signs in first on this browser
function adoptLegacyWork() {
    try {
        const legacy = localStorage.getItem(WORK_KEY);
        if (legacy !== null) {
            const merged = { ...JSON.parse(legacy), ...readStore(scoped(WORK_KEY)) };
            localStorage.setItem(scoped(WORK_KEY), JSON.stringify(merged));
            localStorage.removeItem(WORK_KEY);
        }
    } catch {
        // Unreadable or unavailable storage: nothing to move
    }
    adoptLegacyMedia(storageScope()!);
}

// Switches this browser's saved work to the signed-in account (null when signed out)
export function setStorageUser(userId: number | null) {
    if (setStorageScope(userId) && userId !== null) adoptLegacyWork();
}

export type MediaCategory = "photo" | "video" | "animation" | "document";

// A point plotted on media, in pixels of the original file with y pointing up (0 at the bottom).
// t is the video time in seconds, the click order for an animation, and null for a photo.
export interface MediaPoint {
    t: number | null;
    x: number;
    y: number;
}

// Media added to a project; the file itself is stored separately (see lib/mediaStore)
export interface SavedMedia {
    id: string;
    name: string;
    mime: string;
    category: MediaCategory;
    // Base for the code variables of its points, e.g. "video1" gives x_video1 and y_video1
    varName: string;
    // Seconds a video jumps ahead after each plotted point
    step: number;
    points: MediaPoint[];
    // Variables on the axes of the points graph: one X, any number of Y lines
    graphX: string;
    graphYs: YLine[];
    // Scale and origin that turn the pixel positions into real distances; none means pixels
    calibration?: Calibration | null;
}

export type LengthUnit = "m" | "cm" | "mm";

// A line between two points (pixels, y up) known to be `length` long, and where (0, 0) is
export interface Calibration {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    length: number;
    unit: LengthUnit;
    originX: number;
    originY: number;
}

// A line on a graph: its Y variable and its colour (an index into the graph palette),
// kept per line so removing one line doesn't recolour the others
export interface YLine {
    name: string;
    color: number;
}

// A graph panel: one shared X variable ("" when none is chosen) and a line per Y variable
export interface GraphConfig {
    id: string;
    x: string;
    ys: YLine[];
}

// What the student has done in a project: the start values (run once) and model rules
// (run every step), the number of steps to run, the graph panels and the added media
export interface ProjectWork {
    start: string;
    model: string;
    steps: string;
    graphs: GraphConfig[];
    media: SavedMedia[];
}

// Work saved by earlier versions: one code text, a single chart, single-line media graphs,
// Y lines without colours
type StoredWork = Omit<Partial<ProjectWork>, "graphs"> & {
    code?: string;
    graphs?: (Omit<GraphConfig, "ys"> & { ys: (YLine | string)[] })[];
    xAxis?: string;
    yAxis?: string;
};

// Earlier versions kept one code text in which the first blank line ended the start values.
// Splitting it the same way keeps what each line meant.
function splitLegacyCode(code: string): { start: string; model: string } {
    const blank = /\n[ \t]*\n/.exec(code);
    if (!blank) return { start: code, model: "" };
    return { start: code.slice(0, blank.index + 1), model: code.slice(blank.index + blank[0].length) };
}
type StoredMedia = Omit<SavedMedia, "graphYs"> & { graphYs?: (YLine | string)[]; graphY?: string };

const toLines = (ys: (YLine | string)[]): YLine[] =>
    ys.map((y, i) => (typeof y === "string" ? { name: y, color: i } : y));

export const newGraph = (x = "", ys: YLine[] = []): GraphConfig => ({
    id: `graph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    x,
    ys,
});

export function loadProjectWork(id: string): ProjectWork | null {
    if (!storageScope()) return null;
    return normalizeWork(readStore<StoredWork>(scoped(WORK_KEY))[id]);
}

// Work in any saved shape (this browser's, older versions', the server's) as current ProjectWork
export function normalizeWork(stored: unknown): ProjectWork | null {
    if (!stored || typeof stored !== "object") return null;
    const work = stored as StoredWork;
    const code = typeof work.start === "string" && typeof work.model === "string"
        ? { start: work.start, model: work.model }
        : typeof work.code === "string" ? splitLegacyCode(work.code) : null;
    if (!code) return null;
    const graphs = Array.isArray(work.graphs)
        ? work.graphs.map((g) => ({ ...g, ys: toLines(g.ys) }))
        : [newGraph(String(work.xAxis ?? ""), work.yAxis ? toLines([work.yAxis]) : [])];
    const media = (Array.isArray(work.media) ? work.media as StoredMedia[] : []).map(({ graphY, ...m }) => ({
        ...m,
        graphYs: toLines(Array.isArray(m.graphYs) ? m.graphYs : graphY ? [graphY] : []),
    }));
    return { ...code, steps: String(work.steps ?? ""), graphs, media };
}

export interface SyncState {
    version: number;
    dirty: boolean;
}

export function loadSyncState(id: string): SyncState | undefined {
    if (!storageScope()) return undefined;
    return readStore<SyncState>(scoped(SYNC_KEY))[id];
}

export function saveSyncState(id: string, state: SyncState) {
    if (storageScope()) writeStore(scoped(SYNC_KEY), id, state);
}

// Only the given fields change; the rest of the saved work is kept
export function saveProjectWork(id: string, changes: Partial<ProjectWork>) {
    if (!storageScope()) return;
    // The old single code text is replaced by start and model once they're saved
    const { code: _legacy, ...current } = readStore<StoredWork>(scoped(WORK_KEY))[id] ?? {};
    writeStore(scoped(WORK_KEY), id, { ...current, ...changes });
}
