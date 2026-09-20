export interface RecentProject {
    id: string;
    title: string;
    type: string;
    lastEdit: string;
    explanation: string;
}

export const recentProjects: RecentProject[] = [
    {
        id: "harmonic-pendulum-drag",
        title: "Harmonic Pendulum with Drag",
        type: "Differential Solver",
        lastEdit: "2 mins ago",
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
    },
    {
        id: "double-star-orbit",
        title: "Double Star Orbit Simulation",
        type: "Gravity Array",
        lastEdit: "1 hour ago",
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
    },
    {
        id: "ideal-gas-collisions",
        title: "Ideal Gas Elastic Collisions",
        type: "Stochastic Model",
        lastEdit: "Yesterday",
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
    },
    {
        id: "photon-interference",
        title: "Photon Interference Wavefront",
        type: "Wave Optics",
        lastEdit: "3 days ago",
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
    },
];