import { useEffect, useRef } from "react";

import DownloadIcon16px from "../assets/icons/download-16px.svg";

export interface ExportItem {
    label: string;
    onSelect: () => void;
    disabled?: boolean;
}

// A small "Export" menu of downloads behind a download icon (`label` is its name for screen readers
// and its tooltip). It's a <details>, so it opens with the keyboard and screen readers announce it;
// it closes after a choice, on Escape and when clicking elsewhere.
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
        <details className="export-menu" ref={menu} onKeyDown={(e) => e.key === "Escape" && close()}>
            <summary aria-label={label} title={label}>
                <img src={DownloadIcon16px} alt=""/>
            </summary>
            <div className="export-menu-items">
                {items.map((item) => (
                    <button key={item.label} type="button" disabled={item.disabled} onClick={() => {
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
