import { DEFAULT_POINT_STEP } from "../../components/MediaTile.tsx";
import type { MediaItem } from "../../components/MediaTile.tsx";
import type { MediaCategory, Project, SavedMedia } from "../../data/Projects.tsx";

// Graphs and media share the right-hand column
export const MAX_PANELS = 3;

// Files that can be added (websites are added by address)
const ACCEPT_BY_CATEGORY: Record<Exclude<MediaCategory, "embed">, string> = {
    photo: "image/*",
    video: "video/*",
    animation: "image/gif,video/mp4,video/webm",
    document: ".pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const ALL_MEDIA_ACCEPT = Object.values(ACCEPT_BY_CATEGORY).join(",");

export function inferMediaCategory(file: File): MediaCategory {
    if (file.type === "image/gif") return "animation";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("image/")) return "photo";
    return "document";
}

export const toSaved = (items: MediaItem[]): SavedMedia[] => items.map(({ url: _url, ...saved }) => saved);

// First free name like video1, video2, photo1 for a new media's point variables
export function nextVarName(category: MediaCategory, items: SavedMedia[]) {
    const taken = new Set(items.map((item) => item.varName));
    let n = 1;
    while (taken.has(`${category}${n}`)) n++;
    return `${category}${n}`;
}

// The media a project gives every student to start with; its files stay the project's
export function starterMedia(project: Project | undefined): SavedMedia[] {
    const items: SavedMedia[] = [];
    for (const m of project?.media ?? []) {
        items.push({
            id: m.id,
            name: m.name,
            mime: m.mime,
            category: m.category,
            varName: nextVarName(m.category, items),
            step: DEFAULT_POINT_STEP,
            points: [],
            graphX: m.category === "photo" ? "x" : "t",
            graphYs: [{ name: "y", color: 0 }],
            source: "project",
            ...(m.href ? { href: m.href } : {}),
        });
    }
    return items;
}
