import { useEffect, useRef, useState } from "react";

import PlusIcon20px from "../../assets/icons/plus-20px.svg";
import EmbedDialog from "../../components/EmbedDialog";
import type { Embed } from "../../lib/embeds";
import { closesOnFocusOut, menuKeyDown, opensMenu } from "../../lib/menuKeys";
import { isMac } from "../../lib/platform";
import { useTranslation } from "../../lib/useTranslations";

// The + in the top bar: a new graph, a file from this computer, or a website by its address. It's
// disabled while the right-hand column is full.
export default function InsertMenu({ full, onGraph, onFile, onEmbed }: {
    full: boolean;
    onGraph: () => void;
    onFile: () => void;
    onEmbed: (embed: Embed) => void;
}) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [linkOpen, setLinkOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const button = () => rootRef.current?.querySelector("button");

    useEffect(() => {
        if (!open) return;
        function handlePointerDown(e: PointerEvent) {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        }
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key !== "Escape") return;
            setOpen(false);
            button()?.focus();
        }
        window.addEventListener("pointerdown", handlePointerDown);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("pointerdown", handlePointerDown);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [open]);

    // Each choice closes the menu first
    const choose = (action: () => void) => () => {
        setOpen(false);
        action();
    };

    return (
        <div className="insert-menu-anchor" ref={rootRef} onBlur={closesOnFocusOut(() => setOpen(false))}>
            <button
                type="button"
                className="nav-icon-btn"
                onClick={() => setOpen(!open)}
                onKeyDown={(e) => opensMenu(e) && setOpen(true)}
                disabled={full}
                aria-label={t("modeling.insertMediaEmbeds")}
                title={full ? t("modeling.removePanelTooltip") : t("modeling.insertMediaEmbeds")}
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <img src={PlusIcon20px} alt=""/>
            </button>
            {open && (
                <div className="insert-menu" role="menu" aria-label={t("modeling.insertMediaEmbeds")} onKeyDown={menuKeyDown}>
                    <button type="button" role="menuitem" autoFocus onClick={choose(onGraph)}>
                        {t("modeling.insertGraph")}
                    </button>
                    <button type="button" role="menuitem" onClick={choose(onFile)} aria-keyshortcuts="Meta+O Control+O">
                        {t("modeling.insertMediaFile")}
                        <span className="insert-menu-shortcut">{isMac ? "⌘O" : "Ctrl+O"}</span>
                    </button>
                    <button type="button" role="menuitem" onClick={choose(() => !full && setLinkOpen(true))}>
                        {t("modeling.insertLink")}
                    </button>
                </div>
            )}
            {linkOpen && (
                <EmbedDialog
                    onAdd={(embed) => {
                        setLinkOpen(false);
                        onEmbed(embed);
                    }}
                    onClose={() => setLinkOpen(false)}
                    returnFocus={button}
                />
            )}
        </div>
    );
}
