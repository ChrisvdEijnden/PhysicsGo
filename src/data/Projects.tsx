export interface User {
    name: string;
    email: string;
    class: string;
    projects: Project[];
}

export interface Project {
    id: string;
    title: string;
    type: string;
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
        type: "Differential Solver",
        lastEdit: new Date(2026, 8, 20, 17, 50),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: true,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "double-star-orbit",
        title: "Double Star Orbit Simulation",
        type: "Gravity Array",
        lastEdit: new Date(2026, 8, 19, 16, 36),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: true,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "ideal-gas-collisions",
        title: "Ideal Gas Elastic Collisions",
        type: "Stochastic Model",
        lastEdit: new Date(2026, 8, 17, 9, 41),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: false,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "photon-interference",
        title: "Photon Interference Wavefront",
        type: "Wave Optics",
        lastEdit: new Date(2026, 6, 25, 21, 9),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: false,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "standard-freefall",
        type: "AP Physics Mechanics",
        title: "Standard Freefall",
        lastEdit: new Date(2026, 6, 20, 10, 53),
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
        curriculum: true,
        estimatedTime: 45,
        equipment: ["A small cube", "measuring stick"],
    },
    {
        id: "lorentz-field-trajectory",
        type: "AP Physics Electromagnetism",
        title: "Lorentz Field Trajectory",
        lastEdit: new Date(2026, 2, 4, 12, 34),
        explanation: "Traces the path of a charged particle moving through uniform electric and magnetic fields using the Lorentz force law.",
        curriculum: true,
        estimatedTime: 45,
        equipment: null,
    },
    {
        id: "damped-harmonic-motion",
        type: "Oscillation & Waves",
        title: "Damped Harmonic Motion",
        lastEdit: new Date(2025, 6, 14, 22, 58),
        explanation: "Models a spring-mass system with a velocity-dependent damping force, showing amplitude decay over time.",
        curriculum: false,
        estimatedTime: 45,
        equipment: null,
    },
];
