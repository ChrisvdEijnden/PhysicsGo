import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import "../pages/classes.css";

import ConfirmButton from "./ConfirmButton";
import { api, errorOf } from "../lib/api";
import { authErrorKey } from "../lib/authErrors";
import { formatDueDay } from "../lib/formatDueDate";
import { useAuth } from "../lib/useAuth";
import { assignmentPath, useProjects } from "../lib/useProjects";
import { useTranslation } from "../lib/useTranslations";

interface StudentClass {
    id: number;
    name: string;
    teachers: string[];
    assignments: { id: string; title: string; dueAt: number | null }[];
}

// Students: each class they're in, with its teachers; opened, the assignments it has and "Leave class"
export default function StudentClasses() {
    const { t, language } = useTranslation();
    // Built-in assignments by their name in the interface's language
    const { byId } = useProjects();
    const { user, refresh } = useAuth();
    const [classes, setClasses] = useState<StudentClass[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    // user.classes changes when a class is joined or left
    const classKey = user?.classes.map((c) => c.id).join(",");
    useEffect(() => {
        let cancelled = false;
        api<{ classes: StudentClass[] }>("/classes/mine").then(({ ok, data }) => {
            if (!cancelled && ok && data.classes) setClasses(data.classes);
        });
        return () => {
            cancelled = true;
        };
    }, [classKey]);

    async function leave(id: number) {
        setError(null);
        const { ok, data } = await api(`/classes/mine/${id}`, "DELETE");
        if (!ok) return setError(errorOf(data));
        setClasses((list) => list?.filter((c) => c.id !== id) ?? null);
        await refresh();
    }

    if (!classes) return null;
    if (classes.length === 0) return <p className="classes-empty">{t("dashboard.noClasses")}</p>;
    return (
        <div className="student-classes">
            {classes.map((c) => (
                <details key={c.id} className="student-class">
                    <summary>
                        <span className="student-class-name">{c.name}</span>
                        {c.teachers.length > 0 && <span className="student-class-teachers">{c.teachers.join(", ")}</span>}
                    </summary>
                    <div className="student-class-body">
                        {c.assignments.length === 0
                            ? <p className="classes-empty">{t("dashboard.noAssignmentsInClass")}</p>
                            : (
                                <ul className="student-class-assignments">
                                    {c.assignments.map((a) => (
                                        <li key={a.id}>
                                            <Link to={assignmentPath(a.id)}>{byId(a.id)?.title ?? a.title}</Link>
                                            {a.dueAt !== null && <span>{formatDueDay(a.dueAt, language)}</span>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        <ConfirmButton className="class-button danger" label={t("dashboard.leaveClass")} onConfirm={() => leave(c.id)}/>
                    </div>
                </details>
            ))}
            {error && <p className="class-error" role="alert">{t(authErrorKey(error))}</p>}
        </div>
    );
}
