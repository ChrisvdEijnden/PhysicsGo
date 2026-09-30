import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "../pages/classes.css";

import { useAuth } from "../lib/useAuth";
import type { Result } from "../lib/api";
import type { Publication, PublicationSettings } from "../lib/usePublished";
import { authErrorKey } from "../lib/authErrors";
import { useTranslation } from "../lib/useTranslations";

// What the teacher is filling in for one class; times as <input type="datetime-local"> values
interface Draft {
    instructions: string;
    opens: string;
    due: string;
}

// Local time as "2026-10-01T09:00", the format datetime-local inputs use
function toLocalInput(ms: number | null) {
    if (ms === null) return "";
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string) {
    const ms = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(ms) ? ms : null;
}

// Overlay where a teacher picks which of their classes a project is an assignment in, and per
// class when it opens, when it's due and any instructions for that class
export default function PublishDialog({ title, current, onSave, onClose }: {
    title: string;
    // Classes the project is published to now
    current: Publication[];
    onSave: (classIds: number[], settings: Record<number, PublicationSettings>) => Promise<Result>;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const classes = user?.classes ?? [];
    const [selected, setSelected] = useState(() => new Set(current.map((c) => c.id)));
    // Kept for unticked classes too, so ticking one again brings back what was filled in
    const [drafts, setDrafts] = useState<Record<number, Draft>>(() => Object.fromEntries(current.map((c) => [c.id, {
        instructions: c.instructions,
        opens: toLocalInput(c.opensAt),
        due: toLocalInput(c.dueAt),
    }])));
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

    const draftOf = (id: number): Draft => drafts[id] ?? { instructions: "", opens: "", due: "" };
    const edit = (id: number, change: Partial<Draft>) =>
        setDrafts((prev) => ({ ...prev, [id]: { ...draftOf(id), ...change } }));

    async function save() {
        const settings: Record<number, PublicationSettings> = {};
        for (const id of selected) {
            const draft = draftOf(id);
            const opensAt = fromLocalInput(draft.opens);
            const dueAt = fromLocalInput(draft.due);
            if (opensAt !== null && dueAt !== null && opensAt >= dueAt) {
                return setError(t("publish.errOpensAfterDue", { name: classes.find((c) => c.id === id)?.name ?? "" }));
            }
            settings[id] = { instructions: draft.instructions.trim(), opensAt, dueAt };
        }
        setBusy(true);
        setError(null);
        const res = await onSave([...selected], settings);
        setBusy(false);
        if (res.ok) onClose();
        else setError(t(authErrorKey(res.error)));
    }

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="dialog publish-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-title">
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
                        {classes.map((c) => {
                            const checked = selected.has(c.id);
                            const draft = draftOf(c.id);
                            return (
                                <div key={c.id} className={`publish-class-block${checked ? " checked" : ""}`}>
                                    <label className={`publish-class${checked ? " checked" : ""}`}>
                                        <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} />
                                        <span>{c.name}</span>
                                    </label>
                                    {checked && (
                                        <div className="publish-settings">
                                            <label className="publish-field">
                                                <span>{t("publish.opens")}</span>
                                                <input type="datetime-local" className="class-input" value={draft.opens}
                                                       onChange={(e) => edit(c.id, { opens: e.target.value })}/>
                                            </label>
                                            <label className="publish-field">
                                                <span>{t("publish.due")}</span>
                                                <input type="datetime-local" className="class-input" value={draft.due}
                                                       onChange={(e) => edit(c.id, { due: e.target.value })}/>
                                            </label>
                                            <label className="publish-field wide">
                                                <span>{t("publish.instructions")}</span>
                                                <textarea className="class-input" rows={3} maxLength={5000} value={draft.instructions}
                                                          placeholder={t("publish.instructionsPlaceholder")}
                                                          onChange={(e) => edit(c.id, { instructions: e.target.value })}/>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {error && <p className="auth-error class-error" role="alert">{error}</p>}

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
