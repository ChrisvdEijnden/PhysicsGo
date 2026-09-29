import { useEffect, useState } from "react";

import { useTranslation } from "../lib/useTranslations";

// Two-step button for destructive actions: the first click arms it, the second confirms
export default function ConfirmButton({ label, onConfirm, className, disabled }: {
    label: string;
    onConfirm: () => void;
    className: string;
    disabled?: boolean;
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
        >
            {armed ? t("classes.confirm") : label}
        </button>
    );
}
