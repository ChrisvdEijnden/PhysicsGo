import type { FocusEvent, KeyboardEvent } from "react";

// Keyboard use of a menu (role="menu" with role="menuitem" items): the arrow keys move between the
// items and wrap around, Home and End go to the first and last. Disabled items are skipped.
export function menuKeyDown(e: KeyboardEvent<HTMLElement>) {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'));
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (at + 1) % items.length
        : e.key === "ArrowUp" ? (at <= 0 ? items.length - 1 : at - 1)
            : e.key === "Home" ? 0
                : e.key === "End" ? items.length - 1
                    : null;
    if (next === null) return;
    e.preventDefault();
    items[next].focus();
}

// On a menu's button: the down (or up) arrow opens the menu, like a click
export function opensMenu(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return false;
    e.preventDefault();
    return true;
}

// On the element around a menu and its button: focus moving elsewhere (Tab) closes it
export const closesOnFocusOut = (close: () => void) => (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
};
