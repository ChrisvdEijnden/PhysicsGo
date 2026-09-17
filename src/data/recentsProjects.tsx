export interface RecentProject {
    id: string;
    name: string;
    type: string;
    lastEdit: string;
}

export const recentProjects: RecentProject[] = [
    { id: "harmonic-pendulum-drag", name: "Harmonic Pendulum with Drag", type: "Differential Solver", lastEdit: "2 mins ago" },
    { id: "double-star-orbit", name: "Double Star Orbit Simulation", type: "Gravity Array", lastEdit: "1 hour ago" },
    { id: "ideal-gas-collisions", name: "Ideal Gas Elastic Collisions", type: "Stochastic Model", lastEdit: "Yesterday" },
    { id: "photon-interference", name: "Photon Interference Wavefront", type: "Wave Optics", lastEdit: "3 days ago" },
];