import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import "../styles/global.css";
import "./classes.css";
import "./projecteditor.css";

import TopBar from "../components/TopBar";
import CodeEditor from "../components/codeEditor.tsx";
import ConfirmButton from "../components/ConfirmButton";
import Markdown from "../components/Markdown";
import { useTranslation } from "../lib/useTranslations";
import { translateCode } from "../lib/modelLanguage";
import { assignmentPath, useProjects } from "../lib/useProjects";
import { authErrorKey } from "../lib/authErrors";
import { addProjectLink, deleteProjectMedia, uploadProjectMedia } from "../lib/mediaServer";
import EmbedDialog from "../components/EmbedDialog";
import type { Embed } from "../lib/embeds";
import type { MediaCategory, Project } from "../data/Projects";

const MAX_STARTER_MEDIA = 2;

function categoryOf(file: File): MediaCategory {
    if (file.type === "image/gif") return "animation";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("image/")) return "photo";
    return "document";
}

// Where teachers write a project: /projects/new (optionally a copy of another) or /projects/<id>/edit
function ProjectEditor() {
    const navigate = useNavigate();
    const location = useLocation();
    const { projectId } = useParams();
    const { t, language } = useTranslation();
    const { projects, byId, createProject, replaceProject, updateProject, deleteProject } = useProjects();
    const editing = projectId !== undefined;
    const existing = byId(projectId);
    const copyOf = byId((location.state as { copyOf?: string } | null)?.copyOf);

    const [form, setForm] = useState<{
        title: string; explanation: string; estimatedTime: string; equipment: string; start: string; model: string;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    // The dialog for adding a website to the starter media
    const [linkOpen, setLinkOpen] = useState(false);

    // Filled in once the projects have loaded: the project being edited, the one being copied, or empty
    useEffect(() => {
        if (projects === null || form !== null) return;
        const source = editing ? existing : copyOf;
        if (editing && !existing?.mine) return;
        setForm({
            title: source ? (editing ? source.title : t("projectEditor.copyOf", { title: source.title })) : "",
            explanation: source?.explanation ?? "",
            estimatedTime: source?.estimatedTime != null ? String(source.estimatedTime) : "",
            equipment: source?.equipment.join("\n") ?? "",
            start: translateCode(source?.start ?? "t = 0\ndt = 0.01\n", language),
            model: translateCode(source?.model ?? "stop als t >= 10\n", language),
        });
    }, [projects, form, editing, existing, copyOf, t, language]);

    // The starter code's keywords follow the interface's language, like on the modeling page
    useEffect(() => {
        setForm((f) => f && { ...f, start: translateCode(f.start, language), model: translateCode(f.model, language) });
    }, [language]);

    if (projects === null) return null;
    if (editing && !existing?.mine) return <p className="review-error" role="alert">{t("classes.errNotFound")}</p>;
    if (!form) return null;

    const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => f && { ...f, [field]: e.target.value });

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        const minutes = form.estimatedTime.trim() === "" ? null : Number(form.estimatedTime);
        const fields = {
            title: form.title.trim(),
            explanation: form.explanation,
            estimatedTime: minutes,
            equipment: form.equipment.split("\n").map((x) => x.trim()).filter(Boolean),
            start: form.start,
            model: form.model,
        };
        setBusy(true);
        setError(null);
        const res = editing ? await updateProject(projectId, fields) : await createProject({ ...fields, copyOf: copyOf?.id });
        setBusy(false);
        if (!res.ok) return setError(res.error);
        // Opens the project the way students will see it, where it can be published
        navigate(assignmentPath(res.project.id), { replace: true });
    };

    // Starter media is saved straight away, so it can only be added to a project that exists
    const addMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || !projectId) return;
        setBusy(true);
        setError(null);
        const mediaId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const res = await uploadProjectMedia<Project>(projectId, mediaId, file, categoryOf(file));
        setBusy(false);
        if (res.ok) replaceProject(res.project);
        else setError(res.error);
    };

    // A website (a PhET simulation, a video) every student starts with
    const addLink = async (embed: Embed) => {
        setLinkOpen(false);
        if (!projectId) return;
        setBusy(true);
        setError(null);
        const mediaId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const res = await addProjectLink<Project>(projectId, mediaId, embed.href, embed.name);
        setBusy(false);
        if (res.ok) replaceProject(res.project);
        else setError(res.error);
    };

    const removeMedia = async (mediaId: string) => {
        if (!projectId) return;
        setBusy(true);
        const res = await deleteProjectMedia<Project>(projectId, mediaId);
        setBusy(false);
        if (res.ok) replaceProject(res.project);
        else setError(res.error);
    };

    const remove = async () => {
        if (!projectId) return;
        setBusy(true);
        const res = await deleteProject(projectId);
        setBusy(false);
        if (res.ok) navigate("/dashboard", { replace: true });
        else setError(res.error);
    };

    return (
        <div className="project-editor-page">
            <TopBar title={editing ? t("projectEditor.editTitle") : t("projectEditor.newTitle")}/>

            <form className="project-editor" onSubmit={save}>
                <label className="project-field">
                    <span>{t("projectEditor.title")}</span>
                    <input className="class-input" type="text" required maxLength={100} value={form.title} onChange={set("title")}/>
                </label>
                <label className="project-field">
                    <span>{t("projectEditor.explanation")}</span>
                    <textarea className="class-input" rows={8} maxLength={20000} value={form.explanation} onChange={set("explanation")}/>
                    <span className="section-hint">{t("projectEditor.markdownHint")}</span>
                </label>
                {form.explanation.trim() && (
                    <div className="project-field">
                        <span>{t("projectEditor.preview")}</span>
                        <Markdown className="project-explanation-preview" text={form.explanation}/>
                    </div>
                )}
                <div className="project-field-row">
                    <label className="project-field">
                        <span>{t("projectEditor.estimatedTime")}</span>
                        <input className="class-input" type="number" min={1} max={600} value={form.estimatedTime} onChange={set("estimatedTime")}/>
                    </label>
                    <label className="project-field">
                        <span>{t("projectEditor.equipment")}</span>
                        <textarea className="class-input" rows={3} value={form.equipment} onChange={set("equipment")}/>
                    </label>
                </div>
                <div className="project-field">
                    <span>{t("projectEditor.starterMedia")}</span>
                    <p className="section-hint">{t("projectEditor.starterMediaHint")}</p>
                    {editing && existing ? (
                        <div className="member-list">
                            {existing.media.map((m) => (
                                <div key={m.id} className="member-row">
                                    <div className="member-text">
                                        <p className="member-name">{m.name}</p>
                                        {m.href && <p className="member-sub">{m.href}</p>}
                                    </div>
                                    <ConfirmButton className="class-button danger" label={t("classes.remove")} disabled={busy}
                                                   onConfirm={() => removeMedia(m.id)}/>
                                </div>
                            ))}
                            {existing.media.length < MAX_STARTER_MEDIA && (
                                <div className="project-media-actions">
                                    <label className="class-button project-add-media">
                                        {t("projectEditor.addMedia")}
                                        <input type="file" accept="image/*,video/*,.pdf,application/pdf,.doc,.docx" onChange={addMedia} disabled={busy} hidden/>
                                    </label>
                                    <button type="button" className="class-button project-add-media" disabled={busy} onClick={() => setLinkOpen(true)}>
                                        {t("projectEditor.addLink")}
                                    </button>
                                </div>
                            )}
                            {linkOpen && <EmbedDialog onAdd={addLink} onClose={() => setLinkOpen(false)}/>}
                        </div>
                    ) : (
                        <p className="section-hint">{copyOf?.media.length ? t("projectEditor.mediaCopied") : t("projectEditor.saveFirst")}</p>
                    )}
                </div>
                <div className="project-field">
                    <span>{t("projectEditor.starterCode")}</span>
                    <p className="section-hint">{t("projectEditor.starterHint")}</p>
                    <div className="project-code">
                        <div className="project-code-block">
                            <p className="code-block-label">{t("modeling.startValues")}</p>
                            <CodeEditor value={form.start} onChange={(start) => setForm((f) => f && { ...f, start })}/>
                        </div>
                        <div className="project-code-block">
                            <p className="code-block-label">{t("modeling.modelRules")}</p>
                            <CodeEditor value={form.model} onChange={(model) => setForm((f) => f && { ...f, model })}/>
                        </div>
                    </div>
                </div>

                {error && <p className="auth-error class-error" role="alert">{t(authErrorKey(error))}</p>}
                <div className="project-actions">
                    {editing && (
                        <div className="project-delete">
                            <ConfirmButton className="class-button danger" label={t("projectEditor.delete")} disabled={busy} onConfirm={remove}/>
                            <p className="section-hint">{t("projectEditor.deleteHint")}</p>
                        </div>
                    )}
                    {editing && (
                        <button type="button" className="class-button" onClick={() => navigate(`/projects/${projectId}/preview`)}>
                            {t("preview.button")}
                        </button>
                    )}
                    <button type="button" className="class-button" onClick={() => navigate(-1)}>{t("publish.cancel")}</button>
                    <button type="submit" className="class-button primary" disabled={busy || !form.title.trim()}>
                        {t("projectEditor.save")}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default ProjectEditor;
