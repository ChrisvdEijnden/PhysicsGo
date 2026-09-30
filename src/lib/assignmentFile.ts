import { normalizeWork } from "../data/Projects";
import type { ProjectWork } from "../data/Projects";

// An assignment saved as a file ("Export" on the modeling page) and opened again from the dashboard
// ("Open assignment"), e.g. to keep a copy or continue on another account. It holds the explanation,
// code, graphs and measured points; video and photo files aren't included (their points are).
const FORMAT = "physicsgo-assignment";
const VERSION = 1;
const MAX_TITLE = 100;
const MAX_EXPLANATION = 20000;

export interface AssignmentFile {
    title: string | null;
    explanation: string;
    work: ProjectWork;
}

export function assignmentFileContents(title: string, explanation: string, work: ProjectWork): string {
    return JSON.stringify({ format: FORMAT, version: VERSION, title, explanation, work }, null, 2);
}

// The assignment in a file's text, or null when it isn't one PhysicsGo saved (or one from a newer version)
export function parseAssignmentFile(text: string): AssignmentFile | null {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return null;
    }
    if (!data || typeof data !== "object") return null;
    const file = data as Record<string, unknown>;
    if (file.format !== FORMAT || typeof file.version !== "number" || file.version > VERSION) return null;
    const work = normalizeWork(file.work);
    if (!work) return null;
    const title = typeof file.title === "string" && file.title.trim() ? file.title.trim().slice(0, MAX_TITLE) : null;
    const explanation = typeof file.explanation === "string" ? file.explanation.slice(0, MAX_EXPLANATION) : "";
    return { title, explanation, work };
}
