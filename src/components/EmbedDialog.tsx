import { useState } from "react";

import "../pages/classes.css";

import Dialog from "./Dialog";
import { toEmbed } from "../lib/embeds";
import type { Embed } from "../lib/embeds";
import { useTranslation } from "../lib/useTranslations";

// Asks for the address of a website, video or simulation to show in a panel
export default function EmbedDialog({ onAdd, onClose, returnFocus }: {
    onAdd: (embed: Embed) => void;
    onClose: () => void;
    returnFocus?: () => HTMLElement | null | undefined;
}) {
    const { t } = useTranslation();
    const [text, setText] = useState("");
    const embed = toEmbed(text, window.location.origin);
    const invalid = text.trim() !== "" && !embed;

    return (
        <Dialog labelledBy="embed-title" onClose={onClose} returnFocus={returnFocus}>
            <form className="dialog-form" onSubmit={(e) => {
                e.preventDefault();
                // Not also the form the dialog was opened from (the assignment editor's)
                e.stopPropagation();
                if (embed) onAdd(embed);
            }}>
                <div className="dialog-header">
                    <h2 id="embed-title">{t("embed.title")}</h2>
                    <p>{t("embed.description")}</p>
                </div>
                <label className="publish-field">
                    <span>{t("embed.address")}</span>
                    <input
                        className="class-input"
                        type="text"
                        inputMode="url"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="https://"
                        data-autofocus
                        value={text}
                        aria-invalid={invalid}
                        aria-describedby="embed-status"
                        onChange={(e) => setText(e.target.value)}
                    />
                </label>
                <p id="embed-status" className={invalid ? "class-error embed-status" : "section-hint embed-status"} aria-live="polite">
                    {invalid ? t("embed.invalid") : embed ? t("embed.showsAs", { name: embed.name }) : ""}
                </p>
                <div className="dialog-actions">
                    <button type="button" className="class-button" onClick={onClose}>{t("embed.cancel")}</button>
                    <button type="submit" className="class-button primary" disabled={!embed}>{t("embed.add")}</button>
                </div>
            </form>
        </Dialog>
    );
}
