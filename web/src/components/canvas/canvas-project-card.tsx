import { useEffect, useState } from "react";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { ensureImagePreview, resolveImageUrl } from "@/services/image-storage";
import { Check, Download, Pencil, Trash2, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input } from "antd";
import { useTranslation } from "react-i18next";

import { useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { hasAgentUrlBootstrap } from "@/lib/agent/agent-url-bootstrap";

export function CanvasProjectCard({ project, list = false }: { project: CanvasProject; list?: boolean }) {
    const theme = canvasThemes[useThemeStore(state => state.theme)];
    const image = project.nodes.find(node => node.type === "image" && (node.metadata?.storageKey || node.metadata?.content));
    const [cover, setCover] = useState("");
    useEffect(() => { let active = true; setCover(""); if (image) void (async () => { const url = await ensureImagePreview(image.metadata?.storageKey) || await resolveImageUrl(image.metadata?.storageKey, image.metadata?.content); if (active) setCover(url); })().catch(() => { if (active) setCover(""); }); return () => { active = false; }; }, [image?.metadata?.storageKey, image?.metadata?.content]);
    const { i18n, t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const renameProject = useCanvasStore((state) => state.renameProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const toggleSelected = useCanvasUiStore((state) => state.toggleSelectedProjectId);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const editing = editingId === project.id;
    const selected = selectedIds.includes(project.id);
    const open = () => {
        const agentHash = hasAgentUrlBootstrap(window.location.hash) ? window.location.hash : "";
        navigate(`/canvas/${project.id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}${agentHash}`, { replace: Boolean(agentHash) });
    };
    const saveTitle = () => {
        renameProject(project.id, editingTitle);
        stopEditing();
    };

    return (
        <article className={`group flex cursor-pointer overflow-hidden rounded-2xl border border-black/[0.08] shadow-[0_10px_26px_rgba(15,23,42,0.10)] transition-all duration-200 motion-safe:hover:-translate-y-1 hover:border-[#0ea977]/50 hover:shadow-[0_16px_36px_-8px_rgba(14,169,119,0.15)] dark:border-white/[0.12] ${list ? "flex-wrap items-center sm:flex-nowrap" : "min-h-64 flex-col"}`} style={{ background: theme.glass.inset, color: theme.node.text }} onClick={() => !editing && open()}>
            <div className={`relative m-2.5 flex items-center justify-center overflow-hidden rounded-xl ${list ? "h-16 w-24 shrink-0" : "mb-0 h-40"}`} style={{ background: theme.glass.inset }}>{cover ? <img src={cover} alt="" className="h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-105" loading="lazy" /> : <div className="text-3xl font-semibold tracking-tight opacity-30">BlinkFlow</div>}{!list && <span className="pointer-events-none absolute bottom-3 right-3 rounded-full px-3 py-1 text-xs opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" style={{ background: theme.accent.base, color: theme.node.panel }}>进入画布 ↗</span>}</div>
            <div className={list ? "flex min-w-0 flex-1 items-center gap-2 px-2" : "flex items-start gap-3 px-5 pt-4"}>
                <input
                    type="checkbox"
                    checked={selected}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => toggleSelected(project.id, event.target.checked)}
                    className="mt-1 size-4 accent-stone-950 dark:accent-stone-100"
                    aria-label={t("canvas.project.select", { name: project.title })}
                />
                {editing ? (
                    <Input className="min-w-0" value={editingTitle} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveTitle()} autoFocus />
                ) : (
                    <button
                        type="button"
                        className="min-w-0 cursor-pointer text-left"
                        onClick={(event) => {
                            event.stopPropagation();
                            open();
                        }}
                    >
                        <h2 className="truncate text-base font-semibold tracking-tight">{project.title}</h2>
                        <p className="mt-1 inline-block rounded-md bg-black/[0.04] px-2 py-0.5 font-mono text-[11px] dark:bg-white/[0.06]" style={{ color: theme.node.muted }}>
                            {t("canvas.project.stats", { nodes: project.nodes.length, connections: project.connections.length })}
                        </p>
                    </button>
                )}
            </div>
            <div className={list ? "ml-auto flex flex-wrap items-center gap-2 px-3 py-2" : "mt-3 flex flex-wrap items-end justify-between gap-2 px-5 pb-4"}>
                <p className="rounded-md bg-black/[0.04] px-2 py-0.5 font-mono text-[11px] dark:bg-white/[0.06]" style={{ color: theme.node.muted }}>{t("canvas.project.updated", { date: new Date(project.updatedAt).toLocaleString(i18n.resolvedLanguage, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) })}</p>
                <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                    {editing ? (
                        <>
                            <Button type="text" size="small" shape="circle" icon={<Check className="size-4" />} onClick={saveTitle} aria-label={t("canvas.project.saveName")} />
                            <Button type="text" size="small" shape="circle" icon={<X className="size-4" />} onClick={stopEditing} aria-label={t("canvas.project.cancelRename")} />
                        </>
                    ) : (
                        <>
                            <Button type="text" size="small" shape="circle" icon={<Download className="size-4" />} onClick={() => void exportCanvasProjects([project], project.title || t("canvas.title"))} aria-label={t("canvas.project.export")} />
                            <Button type="text" size="small" shape="circle" icon={<Pencil className="size-4" />} onClick={() => startEditing(project.id, project.title)} aria-label={t("canvas.project.rename")} />
                            <Button type="text" size="small" shape="circle" icon={<Trash2 className="size-4" />} onClick={() => setDeleteIds([project.id])} aria-label={t("canvas.project.delete")} />
                        </>
                    )}
                </div>
            </div>
        </article>
    );
}
