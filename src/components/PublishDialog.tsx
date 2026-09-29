import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "../pages/classes.css";

import { useAuth } from "../lib/useAuth";
import type { ClassRef } from "../lib/useAuth";
import type { Result } from "../lib/api";
import { authErrorKey } from "../lib/authErrors";
import { useTranslation } from "../lib/useTranslations";

// Overlay where a teacher picks which of their classes a project is open to
export default function PublishDialog({ title, current, onSave, onClose }: {
    title: string;
    // Classes the project is published to now
    current: ClassRef[];
    onSave: (classIds: number[]) => Promise<Result>;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const classes = user?.classes ?? [];
    const [selected, setSelected] = useState(() => new Set(current.map((c) => c.id)));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    function toggle(id: number) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function save() {
        setBusy(true);
        setError(null);
        const res = await onSave([...selected]);
        setBusy(false);
        if (res.ok) onClose();
        else setError(res.error);
    }

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="publish-title">
                <div className="dialog-header">
                    <h2 id="publish-title">{t("publish.title", { title })}</h2>
                    <p>{t("publish.description")}</p>
                </div>

                {classes.length === 0 ? (
                    <div className="dialog-empty">
                        <p>{t("publish.noClasses")}</p>
                        <button type="button" className="class-button" onClick={() => navigate("/classes")}>
                            {t("publish.createClass")}
                        </button>
                    </div>
                ) : (
                    <div className="publish-classes">
                        {classes.map((c) => (
                            <label key={c.id} className={`publish-class${selected.has(c.id) ? " checked" : ""}`}>
                                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                                <span>{c.name}</span>
                            </label>
                        ))}
                    </div>
                )}

                {error && <p className="auth-error class-error" role="alert">{t(authErrorKey(error))}</p>}

                <div className="dialog-actions">
                    <button type="button" className="class-button" onClick={onClose}>
                        {t("publish.cancel")}
                    </button>
                    {classes.length > 0 && (
                        <button type="button" className="class-button primary" onClick={save} disabled={busy} autoFocus>
                            {t("publish.save")}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
