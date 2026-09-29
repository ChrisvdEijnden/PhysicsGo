import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { useTranslation } from "../lib/useTranslations";

// Two-step button for destructive actions: the first click arms it, the second confirms.
// With children (e.g. an icon) the label becomes the button's tooltip and accessible name.
export default function ConfirmButton({ label, onConfirm, className, disabled, children }: {
    label: string;
    onConfirm: () => void;
    className: string;
    disabled?: boolean;
    children?: ReactNode;
}) {
    const { t } = useTranslation();
    const [armed, setArmed] = useState(false);

    useEffect(() => {
        if (!armed) return;
        const timer = setTimeout(() => setArmed(false), 4000);
        return () => clearTimeout(timer);
    }, [armed]);

    return (
        <button
            type="button"
            className={`${className}${armed ? " armed" : ""}`}
            disabled={disabled}
            onClick={() => {
                if (!armed) return setArmed(true);
                setArmed(false);
                onConfirm();
            }}
            onBlur={() => setArmed(false)}
            aria-label={children ? label : undefined}
            title={children ? label : undefined}
        >
            {armed ? t("classes.confirm") : children ?? label}
        </button>
    );
}
