import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import "./dialog.css";

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// A modal dialog on the browser's own <dialog>: it keeps keyboard focus inside while open, sits above
// everything else, and closes with Escape or a click next to it. Focus goes back to whatever had it
// before, usually the button that opened it. It's placed at the end of the page, so it's never inside
// another form; React events still reach the component's parents, so a form in it stops its submit.
export default function Dialog({ labelledBy, describedBy, onClose, children, className = "", returnFocus, alert = false }: {
    labelledBy: string;
    describedBy?: string;
    // Escape and a click next to it close it; without onClose it stays until the page removes it
    onClose?: () => void;
    children: ReactNode;
    className?: string;
    // Something that needs an answer before going on (announced as an alert dialog)
    alert?: boolean;
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
        // React's autoFocus runs while the dialog is still closed, so the element to start on is
        // marked with data-autofocus instead (otherwise the browser picks the first one)
        dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
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
            role={alert ? "alertdialog" : undefined}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            // Escape: the page decides when the dialog goes, so it stays in step with its state
            onCancel={(e) => {
                e.preventDefault();
                onClose?.();
            }}
            // The <dialog> itself only receives presses outside its content: on the backdrop
            onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}
            // Tab goes round within the dialog instead of out to the browser's own controls
            onKeyDown={(e) => {
                if (e.key !== "Tab") return;
                const focusable = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE))
                    .filter((el) => el.offsetParent !== null || el === document.activeElement);
                if (focusable.length === 0) return;
                const [first, last] = [focusable[0], focusable[focusable.length - 1]];
                if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                } else if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            }}
        >
            <div className={`dialog ${className}`}>{children}</div>
        </dialog>,
        document.body
    );
}
