import { useEffect, useRef } from "react";

import DownloadIcon18px from "../assets/icons/download-18px.svg";
import { menuKeyDown } from "../lib/menuKeys";

export interface ExportItem {
    label: string;
    onSelect: () => void;
    disabled?: boolean;
}

// A small "Export" menu of downloads behind a download icon (`label` is its name for screen readers
// and its tooltip). It's a <details>, so it opens with the keyboard and screen readers announce it.
// Opening it puts focus on the first choice, the arrow keys move between them, and it closes after a
// choice, on Escape, when clicking elsewhere and when focus moves out of it.
export default function ExportMenu({ label, items }: { label: string; items: ExportItem[] }) {
    const menu = useRef<HTMLDetailsElement | null>(null);

    useEffect(() => {
        const closeOutside = (e: PointerEvent) => {
            if (menu.current?.open && !menu.current.contains(e.target as Node)) menu.current.open = false;
        };
        window.addEventListener("pointerdown", closeOutside);
        return () => window.removeEventListener("pointerdown", closeOutside);
    }, []);

    const close = () => {
        if (!menu.current) return;
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
    };

    return (
        <details
            className="export-menu"
            ref={menu}
            onKeyDown={(e) => e.key === "Escape" && close()}
            onToggle={(e) => {
                if (e.currentTarget.open) e.currentTarget.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
            }}
            onBlur={(e) => {
                if (menu.current?.open && !e.currentTarget.contains(e.relatedTarget as Node | null)) menu.current.open = false;
            }}
        >
            <summary aria-label={label} title={label} aria-haspopup="menu">
                <img src={DownloadIcon18px} alt=""/>
            </summary>
            <div className="export-menu-items" role="menu" aria-label={label} onKeyDown={menuKeyDown}>
                {items.map((item) => (
                    <button key={item.label} type="button" role="menuitem" disabled={item.disabled} onClick={() => {
                        close();
                        item.onSelect();
                    }}>
                        {item.label}
                    </button>
                ))}
            </div>
        </details>
    );
}
