import type { ClassRef } from "../lib/useAuth";
import { useTranslation } from "../lib/useTranslations";

// Bubbles for the classes a project is open to: the first one, then "+N" for the rest.
// Teachers also see when a project isn't open to any class yet.
export default function ProjectClasses({ classes, isTeacher }: { classes: ClassRef[] | undefined; isTeacher: boolean }) {
    const { t } = useTranslation();
    if (!classes || classes.length === 0) {
        return isTeacher ? <span className="class-chip muted">{t("publish.notPublished")}</span> : null;
    }
    const [first, ...rest] = classes;
    return (
        <span className="project-classes" title={classes.map((c) => c.name).join(", ")}>
            <span className="class-chip">{first.name}</span>
            {rest.length > 0 && <span className="class-chip more">+{rest.length}</span>}
        </span>
    );
}
