export interface User {
    name: string;
    email: string;
    class: string;
    projects: Project[];
}

export interface Project {
    id: string;
    title: string;
    lastEdit: Date;
    explanation: string;
    curriculum: boolean;
    estimatedTime: number; // in minutes
    equipment: string[] | null;
}

export const Projects: Project[] = [
    {
        id: "harmonic-pendulum-drag",
        title: "Harmonic Pendulum with Drag",
        lastEdit: new Date(2026, 8, 20, 17, 50),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: true,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "double-star-orbit",
        title: "Double Star Orbit Simulation",
        lastEdit: new Date(2026, 8, 19, 16, 36),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: true,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "ideal-gas-collisions",
        title: "Ideal Gas Elastic Collisions",
        lastEdit: new Date(2026, 8, 17, 9, 41),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: false,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "photon-interference",
        title: "Photon Interference Wavefront",
        lastEdit: new Date(2026, 6, 25, 21, 9),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: false,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "standard-freefall",
        title: "Standard Freefall",
        lastEdit: new Date(2026, 6, 20, 10, 53),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: true,
        estimatedTime: 45,
        equipment: ["A small cube", "measuring stick"],
    },
    {
        id: "lorentz-field-trajectory",
        title: "Lorentz Field Trajectory",
        lastEdit: new Date(2026, 2, 4, 12, 34),
        explanation: "Traces the path of a charged particle moving through uniform electric and magnetic fields using the Lorentz force law.",
        curriculum: true,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "damped-harmonic-motion",
        title: "Damped Harmonic Motion",
        lastEdit: new Date(2025, 6, 14, 22, 58),
        explanation: "Models a spring-mass system with a velocity-dependent damping force, showing amplitude decay over time.",
        curriculum: false,
        estimatedTime: 45,
        equipment: null,
    },
];

// Edit times and each project's work are kept in localStorage until projects are saved on the server
const EDITS_KEY = "physicsgo_project_edits";
const WORK_KEY = "physicsgo_project_work";

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

for (const [id, time] of Object.entries(readStore<number>(EDITS_KEY))) {
    const project = Projects.find((p) => p.id === id);
    if (project && typeof time === "number") project.lastEdit = new Date(time);
}

export function markProjectEdited(id: string) {
    const project = Projects.find((p) => p.id === id);
    if (!project) return;
    project.lastEdit = new Date();
    writeStore(EDITS_KEY, id, project.lastEdit.getTime());
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

// What the student has done in a project: the model code, the number of steps to run,
// the graph panels and the added media
export interface ProjectWork {
    code: string;
    steps: string;
    graphs: GraphConfig[];
    media: SavedMedia[];
}

// Work saved by earlier versions: a single chart, single-line media graphs, Y lines without colours
type StoredWork = Omit<Partial<ProjectWork>, "graphs"> & {
    graphs?: (Omit<GraphConfig, "ys"> & { ys: (YLine | string)[] })[];
    xAxis?: string;
    yAxis?: string;
};
type StoredMedia = Omit<SavedMedia, "graphYs"> & { graphYs?: (YLine | string)[]; graphY?: string };

const toLines = (ys: (YLine | string)[]): YLine[] =>
    ys.map((y, i) => (typeof y === "string" ? { name: y, color: i } : y));

export const newGraph = (x = "", ys: YLine[] = []): GraphConfig => ({
    id: `graph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    x,
    ys,
});

export function loadProjectWork(id: string): ProjectWork | null {
    const work = readStore<StoredWork>(WORK_KEY)[id];
    if (!work || typeof work.code !== "string") return null;
    const graphs = Array.isArray(work.graphs)
        ? work.graphs.map((g) => ({ ...g, ys: toLines(g.ys) }))
        : [newGraph(String(work.xAxis ?? ""), work.yAxis ? toLines([work.yAxis]) : [])];
    const media = (Array.isArray(work.media) ? work.media as StoredMedia[] : []).map(({ graphY, ...m }) => ({
        ...m,
        graphYs: toLines(Array.isArray(m.graphYs) ? m.graphYs : graphY ? [graphY] : []),
    }));
    return { code: work.code, steps: String(work.steps ?? ""), graphs, media };
}

// Only the given fields change; the rest of the saved work is kept
export function saveProjectWork(id: string, changes: Partial<ProjectWork>) {
    const current = readStore<ProjectWork>(WORK_KEY)[id];
    writeStore(WORK_KEY, id, { ...current, ...changes });
}

export const byLastEdit =(a: Project, b: Project) => b.lastEdit.getTime() - a.lastEdit.getTime();
