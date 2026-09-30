import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import "./dialog.css";

// A modal dialog on the browser's own <dialog>: it keeps keyboard focus inside while open, sits above
// everything else, and closes with Escape or a click next to it. Focus goes back to whatever had it
// before, usually the button that opened it. It's placed at the end of the page, so it's never inside
// another form; React events still reach the component's parents, so a form in it stops its submit.
export default function Dialog({ labelledBy, onClose, children, className = "", returnFocus }: {
    labelledBy: string;
    onClose: () => void;
    children: ReactNode;
    className?: string;
    // Where focus goes afterwards when what had it is gone, e.g. the button of a menu that closed
    returnFocus?: () => HTMLElement | null | undefined;
}) {
    const ref = useRef<HTMLDialogElement | null>(null);

    const returnFocusRef = useRef(returnFocus);
    returnFocusRef.current = returnFocus;

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        const active = document.activeElement;
        const opener = active instanceof HTMLElement && active !== document.body ? active : null;
        if (!dialog.open) dialog.showModal();
        return () => {
            if (dialog.open) dialog.close();
            // After the page has updated, so a menu that closed has given its button back
            requestAnimationFrame(() => {
                const target = opener?.isConnected ? opener : returnFocusRef.current?.();
                target?.focus();
            });
        };
    }, []);

    return createPortal(
        <dialog
            ref={ref}
            className="modal"
            aria-labelledby={labelledBy}
            // Escape: the page decides when the dialog goes, so it stays in step with its state
            onCancel={(e) => {
                e.preventDefault();
                onClose();
            }}
            // The <dialog> itself only receives presses outside its content: on the backdrop
            onPointerDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className={`dialog ${className}`}>{children}</div>
        </dialog>,
        document.body
    );
}
