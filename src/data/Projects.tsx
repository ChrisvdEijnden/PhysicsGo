export interface User {
    name: string;
    email: string;
    class: string;
    projects: Project[];
}

export interface Project {
    id: string;
    title: string;
    className: string | null; // class the project is assigned to; null for personal projects
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
        className: "V6A",
        lastEdit: new Date(2026, 8, 20, 17, 50),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: true,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "double-star-orbit",
        title: "Double Star Orbit Simulation",
        className: "V6A",
        lastEdit: new Date(2026, 8, 19, 16, 36),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: true,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "ideal-gas-collisions",
        title: "Ideal Gas Elastic Collisions",
        className: "H5B",
        lastEdit: new Date(2026, 8, 17, 9, 41),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: false,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "photon-interference",
        title: "Photon Interference Wavefront",
        className: "V5C",
        lastEdit: new Date(2026, 6, 25, 21, 9),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: false,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "standard-freefall",
        className: "V6A",
        title: "Standard Freefall",
        lastEdit: new Date(2026, 6, 20, 10, 53),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: true,
        estimatedTime: 45,
        equipment: ["A small cube", "measuring stick"],
    },
    {
        id: "lorentz-field-trajectory",
        className: "H5B",
        title: "Lorentz Field Trajectory",
        lastEdit: new Date(2026, 2, 4, 12, 34),
        explanation: "Traces the path of a charged particle moving through uniform electric and magnetic fields using the Lorentz force law.",
        curriculum: true,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "damped-harmonic-motion",
        className: "V5C",
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

// What the student has done in a project: the model code, the number of steps to run
// and the variables plotted on the chart's axes ("" when none is chosen)
export interface ProjectWork {
    code: string;
    steps: string;
    xAxis: string;
    yAxis: string;
}

export function loadProjectWork(id: string): ProjectWork | null {
    const work = readStore<Partial<ProjectWork>>(WORK_KEY)[id];
    if (!work || typeof work.code !== "string") return null;
    return {
        code: work.code,
        steps: String(work.steps ?? ""),
        xAxis: String(work.xAxis ?? ""),
        yAxis: String(work.yAxis ?? ""),
    };
}

// Only the given fields change; the rest of the saved work is kept
export function saveProjectWork(id: string, changes: Partial<ProjectWork>) {
    const current = readStore<ProjectWork>(WORK_KEY)[id];
    writeStore(WORK_KEY, id, { ...current, ...changes });
}

// Personal projects are always shown; class projects only to members (students or teachers) of that class
export function isVisibleTo(project: Project, classNames: string[]) {
    if (!project.className) return true;
    const name = project.className.trim().toLowerCase();
    return classNames.some((c) => c.trim().toLowerCase() === name);
}

export const byLastEdit =(a: Project, b: Project) => b.lastEdit.getTime() - a.lastEdit.getTime();
