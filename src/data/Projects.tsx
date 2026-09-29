export interface User {
    name: string;
    email: string;
    class: string;
    projects: Project[];
}

export interface Project {
    id: string;
    title: string;
    className: string; // class the project is assigned to
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

// Edit times are kept in localStorage until projects are saved on the server
const EDITS_KEY = "physicsgo_project_edits";

function readEdits(): Record<string, number> {
    try {
        const edits = JSON.parse(localStorage.getItem(EDITS_KEY) ?? "{}");
        return edits && typeof edits === "object" ? edits : {};
    } catch {
        return {};
    }
}

for (const [id, time] of Object.entries(readEdits())) {
    const project = Projects.find((p) => p.id === id);
    if (project && typeof time === "number") project.lastEdit = new Date(time);
}

export function markProjectEdited(id: string) {
    const project = Projects.find((p) => p.id === id);
    if (!project) return;
    project.lastEdit = new Date();
    try {
        localStorage.setItem(EDITS_KEY, JSON.stringify({ ...readEdits(), [id]: project.lastEdit.getTime() }));
    } catch {
        // Storage can be unavailable; the edit time then lasts until the app reloads
    }
}

export const byLastEdit = (a: Project, b: Project) => b.lastEdit.getTime() - a.lastEdit.getTime();
