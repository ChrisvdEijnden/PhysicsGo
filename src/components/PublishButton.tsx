import { useState } from "react";

import PublishIcon16px from "../assets/icons/publish-16px.svg";
import PublishDialog from "./PublishDialog";
import type { ClassRef } from "../lib/useAuth";
import type { Result } from "../lib/api";
import { useTranslation } from "../lib/useTranslations";

// Icon button on a project row that opens the publish overlay; for teachers only
export default function PublishButton({ title, classes, onSave }: {
    title: string;
    classes: ClassRef[] | undefined;
    onSave: (classIds: number[]) => Promise<Result>;
}) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                className="publish-btn"
                aria-label={t("publish.button")}
                title={t("publish.button")}
                // The row itself opens the project; this button shouldn't
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen(true);
                }}
            >
                <img src={PublishIcon16px} alt=""/>
            </button>
            {open && (
                // Clicks inside the overlay mustn't reach the row underneath either
                <div onClick={(e) => e.stopPropagation()}>
                    <PublishDialog title={title} current={classes ?? []} onSave={onSave} onClose={() => setOpen(false)}/>
                </div>
            )}
        </>
    );
}
