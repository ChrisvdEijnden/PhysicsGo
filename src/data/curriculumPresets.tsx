// here comes the teacher's curriculum presets, for now these are placeholders

export type CurriculumPresetType =
    | "AP Physics Mechanics"
    | "AP Physics Electromagnetism"
    | "Oscillation & Waves"
    | "Thermodynamics"
    | "Optics";

export interface CurriculumPreset {
    id: string;
    type: CurriculumPresetType;
    title: string;
    explanation: string;
}

export const curriculumPresets: CurriculumPreset[] = [
    {
        id: "standard-freefall",
        type: "AP Physics Mechanics",
        title: "Standard Freefall",
        explanation: "Simulates an object falling under constant gravitational acceleration, tracking position, velocity, and time to impact.",
    },
    {
        id: "lorentz-field-trajectory",
        type: "AP Physics Electromagnetism",
        title: "Lorentz Field Trajectory",
        explanation: "Traces the path of a charged particle moving through uniform electric and magnetic fields using the Lorentz force law.",
    },
    {
        id: "damped-harmonic-motion",
        type: "Oscillation & Waves",
        title: "Damped Harmonic Motion",
        explanation: "Models a spring-mass system with a velocity-dependent damping force, showing amplitude decay over time.",
    },
];