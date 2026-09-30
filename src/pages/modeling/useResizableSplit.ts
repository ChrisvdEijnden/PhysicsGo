import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

// Moves the divider after panel `index` by `delta` percent, keeping both panels next to it at least `min`
function resizePair<T extends number[]>(sizes: T, index: number, delta: number, min: number): T {
    const total = sizes[index] + sizes[index + 1];
    const first = Math.min(Math.max(sizes[index] + delta, min), total - min);
    const next = [...sizes] as T;
    next[index] = first;
    next[index + 1] = total - first;
    return next;
}

// Dividers move with the arrow keys along their direction, 2% at a time; Home and End move them all the way
const DIVIDER_KEY_STEP = 2;
function dividerKeyDelta(key: string, orientation: "vertical" | "horizontal"): number | null {
    const [back, forward] = orientation === "vertical" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
    if (key === back) return -DIVIDER_KEY_STEP;
    if (key === forward) return DIVIDER_KEY_STEP;
    if (key === "Home") return -100;
    if (key === "End") return 100;
    return null;
}

/**
 * Panels side by side (axis "x": columns) or stacked (axis "y": rows) whose sizes, in percent of the
 * container, change by dragging the dividers between them or with the keyboard. Each divider is a
 * focusable separator that reports the size of the panel before it.
 */
export function useResizableSplit<T extends number[]>(axis: "x" | "y", initial: T, min: number) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [sizes, setSizes] = useState<T>(initial);
    const [dragging, setDragging] = useState<number | null>(null);
    const drag = useRef<{ index: number; start: number; startSizes: T } | null>(null);
    const orientation = axis === "x" ? "vertical" : "horizontal";

    const onPointerMove = useCallback((e: PointerEvent) => {
        const state = drag.current;
        const container = containerRef.current;
        if (!state || !container) return;
        const rect = container.getBoundingClientRect();
        const moved = axis === "x" ? e.clientX - state.start : e.clientY - state.start;
        const delta = (moved / (axis === "x" ? rect.width : rect.height)) * 100;
        setSizes(resizePair(state.startSizes, state.index, delta, min));
    }, [axis, min]);

    const onPointerUp = useCallback(function stop() {
        drag.current = null;
        setDragging(null);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", stop);
    }, [onPointerMove]);

    // Everything a divider element needs: dragging, keys, and its separator role and values
    const dividerProps = (index: number) => ({
        onPointerDown: (e: ReactPointerEvent) => {
            e.preventDefault();
            drag.current = { index, start: axis === "x" ? e.clientX : e.clientY, startSizes: sizes };
            setDragging(index);
            document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
            document.body.style.userSelect = "none";
            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp);
        },
        role: "separator",
        tabIndex: 0,
        "aria-orientation": orientation,
        "aria-valuenow": Math.round(sizes[index] ?? 0),
        "aria-valuemin": min,
        "aria-valuemax": Math.round((sizes[index] ?? 0) + (sizes[index + 1] ?? 0) - min),
        onKeyDown: (e: KeyboardEvent) => {
            const delta = dividerKeyDelta(e.key, orientation);
            if (delta === null) return;
            e.preventDefault();
            setSizes((current) => resizePair(current, index, delta, min));
        },
    } as const);

    return { containerRef, sizes, setSizes, dragging, dividerProps };
}
