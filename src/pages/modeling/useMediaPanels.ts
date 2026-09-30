import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { DEFAULT_POINT_STEP, hasTime, pointSeries } from "../../components/MediaTile.tsx";
import type { MediaItem } from "../../components/MediaTile.tsx";
import type { ChartPoint } from "../../components/lineChart.tsx";
import type { Project, SavedMedia } from "../../data/Projects.tsx";
import { realPoints } from "../../lib/calibration";
import { safeEmbedSrc } from "../../lib/embeds";
import type { Embed } from "../../lib/embeds";
import { deleteServerMedia, mediaOnServer, mediaUrl, projectMediaUrl, uploadMedia, urlExists } from "../../lib/mediaServer";
import { deleteMediaFile, loadMediaFile, mediaKey, saveMediaFile } from "../../lib/mediaStore";
import { ALL_MEDIA_ACCEPT, MAX_PANELS, inferMediaCategory, nextVarName, toSaved } from "./media";

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The photos, videos, documents and websites in the right-hand column. Their points and settings are
 * saved with the work (through `onChange`); the files themselves in this browser (IndexedDB) and on
 * the server.
 */
export function useMediaPanels({ project, initialMedia, reviewedStudent, noSaving, graphCount, onChange }: {
    project: Project | undefined;
    // What the work starts with: what was saved, or the project's starter media
    initialMedia: SavedMedia[];
    // A teacher looking at a student's work sees that student's files
    reviewedStudent: number | undefined;
    noSaving: boolean;
    // Graphs share the column, so they count towards the panels there's room for
    graphCount: number;
    onChange: (media: SavedMedia[]) => void;
}) {
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    // Media is loaded from this device after opening; until then the saved media is what counts
    const loaded = useRef(!project);
    const itemsRef = useRef<MediaItem[]>([]);
    // Media that couldn't be stored on the server, and why; it's still kept in this browser
    const [mediaError, setMediaError] = useState<{ name: string; error: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const panelCount = graphCount + mediaItems.length;
    const panelCountRef = useRef(panelCount);
    panelCountRef.current = panelCount;
    const panelsFull = panelCount >= MAX_PANELS;

    useEffect(() => {
        itemsRef.current = mediaItems;
    }, [mediaItems]);

    // Reopening a project brings back its media: from this browser when it has the file (sending it to
    // the server if that doesn't have it yet), otherwise from the server. A file found in neither keeps its points.
    useEffect(() => {
        if (!project) return;
        let cancelled = false;
        Promise.all(initialMedia.map(async (media): Promise<MediaItem> => {
            // A website has no file: the frame loads its address (checked again before it's shown)
            if (media.category === "embed") return { ...media, url: safeEmbedSrc(media.href, window.location.origin) ?? "" };
            if (media.source === "project") {
                const url = projectMediaUrl(project.id, media.id);
                return { ...media, url: (await urlExists(url)) ? url : "" };
            }
            if (reviewedStudent !== undefined) {
                const onServer = await mediaOnServer(project.id, media.id, reviewedStudent);
                return { ...media, url: onServer ? mediaUrl(project.id, media.id, reviewedStudent) : "" };
            }
            const file = await loadMediaFile(mediaKey(project.id, media.id)).catch(() => undefined);
            if (file) {
                mediaOnServer(project.id, media.id).then((onServer) => {
                    if (onServer === false) uploadMedia(project.id, media.id, file);
                });
                return { ...media, url: URL.createObjectURL(file) };
            }
            const onServer = await mediaOnServer(project.id, media.id);
            return { ...media, url: onServer ? mediaUrl(project.id, media.id) : "" };
        })).then((items) => {
            if (cancelled) {
                items.forEach((item) => item.url.startsWith("blob:") && URL.revokeObjectURL(item.url));
                return;
            }
            loaded.current = true;
            setMediaItems(items);
        });
        return () => {
            cancelled = true;
        };
    }, [project, initialMedia, reviewedStudent]);

    // Revoke every blob URL on unmount so nothing leaks
    useEffect(() => () => {
        itemsRef.current.forEach((item) => item.url.startsWith("blob:") && URL.revokeObjectURL(item.url));
    }, []);

    const openFilePicker = useCallback(() => {
        if (panelCountRef.current >= MAX_PANELS || noSaving) return;
        const input = fileInputRef.current;
        if (!input) return;
        input.accept = ALL_MEDIA_ACCEPT;
        input.click();
    }, [noSaving]);

    // Cmd+O (Mac) / Ctrl+O (Windows/Linux) opens the same picker as the menu. preventDefault stops the
    // browser's own "Open File" dialog, which most browsers bind to this combination.
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "o") {
                e.preventDefault();
                openFilePicker();
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [openFilePicker]);

    function setMedia(items: MediaItem[]) {
        setMediaItems(items);
        onChange(toSaved(items));
    }

    function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow picking the same file again later
        if (!file || !loaded.current || panelsFull) return;

        const category = inferMediaCategory(file);
        const item: MediaItem = {
            id: newId(),
            category,
            name: file.name,
            url: URL.createObjectURL(file),
            mime: file.type,
            varName: nextVarName(category, mediaItems),
            step: DEFAULT_POINT_STEP,
            points: [],
            graphX: category === "photo" ? "x" : "t",
            graphYs: [{ name: "y", color: 0 }],
        };
        setMedia([...mediaItems, item]);
        if (!project) return;
        const projectId = project.id;
        saveMediaFile(mediaKey(projectId, item.id), file).catch(() => undefined);
        setMediaError(null);
        uploadMedia(projectId, item.id, file).then((res) => {
            // Offline uploads happen the next time the project opens; other failures are shown
            if (!res.ok && res.error !== "network") setMediaError({ name: file.name, error: res.error });
        });
    }

    function addEmbed(embed: Embed) {
        if (panelsFull) return;
        setMedia([...mediaItems, {
            id: newId(),
            category: "embed",
            name: embed.name,
            url: embed.href,
            href: embed.href,
            mime: "text/html",
            varName: nextVarName("embed", mediaItems),
            step: DEFAULT_POINT_STEP,
            points: [],
            graphX: "",
            graphYs: [],
        }]);
    }

    function updateMediaItem(updated: MediaItem) {
        setMedia(mediaItems.map((item) => (item.id === updated.id ? updated : item)));
    }

    function removeMediaItem(id: string) {
        const target = mediaItems.find((item) => item.id === id);
        if (target?.url.startsWith("blob:")) URL.revokeObjectURL(target.url);
        setMedia(mediaItems.filter((item) => item.id !== id));
        // Starter media stays the project's; only the student's own files are deleted
        if (!project || noSaving || target?.source === "project" || target?.category === "embed") return;
        deleteMediaFile(mediaKey(project.id, id)).catch(() => {});
        deleteServerMedia(project.id, id);
    }

    // Points plotted on videos and stroboscopic photos, as variables the code can read at the current t
    const measuredData = useMemo(() => mediaItems.flatMap(pointSeries), [mediaItems]);

    // The measured points themselves (in calibrated units), drawn as dots with the line of their variable when
    // the graph's X is t or the same media's other coordinate
    const markersFor = useCallback((x: string, y: string): ChartPoint[] => {
        for (const item of mediaItems) {
            if (!hasTime(item)) continue;
            const [xName, yName] = [`x_${item.varName}`, `y_${item.varName}`];
            const pick = (axis: string): "t" | "x" | "y" | null =>
                axis === "t" ? "t" : axis === xName ? "x" : axis === yName ? "y" : null;
            const [px, py] = [pick(x), pick(y)];
            if (!px || !py || py === "t") continue;
            return realPoints(item).map((p) => ({ x: px === "t" ? p.t ?? 0 : p[px], y: p[py] }));
        }
        return [];
    }, [mediaItems]);

    return {
        mediaItems,
        // The media as it's saved: before the files have loaded, what was saved before
        savedMedia: () => (loaded.current ? toSaved(mediaItems) : initialMedia),
        panelsFull,
        mediaError,
        setMediaError,
        fileInputRef,
        openFilePicker,
        handleFileChange,
        addEmbed,
        updateMediaItem,
        removeMediaItem,
        measuredData,
        markersFor,
    };
}
