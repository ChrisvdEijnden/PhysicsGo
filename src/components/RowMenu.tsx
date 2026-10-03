import { useEffect, useRef, useState } from "react";

import MoreIcon20px from "../assets/icons/more-20px.svg";
import { closesOnFocusOut, menuKeyDown, opensMenu } from "../lib/menuKeys";
import { useTranslation } from "../lib/useTranslations";

export interface RowMenuItem {
    label: string;
    onSelect: () => void;
    // Red, and asks "Confirm?" first: the first choice arms it, the second does it
    danger?: boolean;
    // A dangerous item that opens a dialog asking for confirmation, so it doesn't arm first
    opensDialog?: boolean;
}

// The actions for one row of a list behind a ⋯ button at its right end. The button only shows when
// the row is hovered or has keyboard focus (always on touch screens); see .row-menu in classes.css.
export default function RowMenu({ label, items, disabled }: {
    // What the button is called for screen readers and as its tooltip, e.g. "Actions for Sam"
    label: string;
    items: RowMenuItem[];
    disabled?: boolean;
}) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    // The dangerous item waiting for its second click
    const [armed, setArmed] = useState<number | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);

    const close = (refocus: boolean) => {
        setOpen(false);
        setArmed(null);
        if (refocus) rootRef.current?.querySelector<HTMLButtonElement>(".row-menu-button")?.focus();
    };

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) close(false);
        };
        const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && close(true);
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    // An armed item goes back to normal after a while
    useEffect(() => {
        if (armed === null) return;
        const timer = setTimeout(() => setArmed(null), 4000);
        return () => clearTimeout(timer);
    }, [armed]);

    return (
        <div className={`row-menu${open ? " open" : ""}`} ref={rootRef} onBlur={closesOnFocusOut(() => close(false))}>
            <button
                type="button"
                className="row-menu-button"
                aria-label={label}
                title={label}
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => (open ? close(false) : setOpen(true))}
                onKeyDown={(e) => opensMenu(e) && setOpen(true)}
            >
                <img src={MoreIcon20px} alt=""/>
            </button>
            {open && (
                <div className="row-menu-items" role="menu" aria-label={label} onKeyDown={menuKeyDown}>
                    {items.map((item, i) => (
                        <button
                            key={item.label}
                            type="button"
                            role="menuitem"
                            className={`${item.danger ? "danger" : ""}${armed === i ? " armed" : ""}`}
                            autoFocus={i === 0}
                            onClick={() => {
                                if (item.danger && !item.opensDialog && armed !== i) return setArmed(i);
                                close(true);
                                item.onSelect();
                            }}
                        >
                            {armed === i ? t("classes.confirmAction", { action: item.label }) : item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
