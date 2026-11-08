import { useState } from "react";
import { App, Button, Input, Modal, Segmented, Select } from "antd";
import { FileText, Pencil, Plus, Search, Send, Trash2, Workflow } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAssetStore, type TextAsset } from "@/stores/use-asset-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";
import { insertLibraryItem, workflowOf, type SavedWorkflow } from "./library-data";

export function ResourceBrowser({ compact = false, onInsert, onInsertWorkflow, nodes, connections = [] }: { compact?: boolean; onInsert?: (payload: InsertAssetPayload) => void | Promise<void>; onInsertWorkflow?: (workflow: SavedWorkflow) => void | Promise<void>; nodes?: CanvasNodeData[]; connections?: CanvasConnection[] }) {
    const { message } = App.useApp(), navigate = useNavigate();
    const { assets, hydrated, addAsset, updateAsset, removeAsset } = useAssetStore();
    const projects = useCanvasStore((state) => state.projects);
    const [query, setQuery] = useState(""), [kind, setKind] = useState("all"), [editor, setEditor] = useState<"prompt" | "workflow" | null>(null), [editing, setEditing] = useState<TextAsset | null>(null);
    const [title, setTitle] = useState(""), [content, setContent] = useState(""), [sourceId, setSourceId] = useState("");
    const [sending, setSending] = useState<TextAsset | null>(null), [targetId, setTargetId] = useState(""), [busy, setBusy] = useState(false);
    const items = assets.filter((asset): asset is TextAsset => asset.kind === "text").filter((asset) => (kind === "all" || (kind === "workflow") === Boolean(workflowOf(asset))) && [asset.title, asset.data.content, ...(asset.tags || [])].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
    const edit = (type: "prompt" | "workflow", asset?: TextAsset) => { setEditing(asset || null); setEditor(type); setTitle(asset?.title || ""); setContent(asset?.data.content || ""); setSourceId(projects[0]?.id || ""); };
    const save = () => {
        if (!title.trim()) { message.warning("请填写资源名称"); return; }
        if (editor === "prompt" && !content.trim()) { message.warning("请填写提示词内容"); return; }
        let workflow = editing ? workflowOf(editing) : null;
        if (editor === "workflow" && !editing) {
            const source = nodes ? { nodes, connections } : projects.find((project) => project.id === sourceId);
            if (!source?.nodes.length) { message.warning("请先准备包含节点的画布"); return; }
            const ids = new Set(source.nodes.map((node) => node.id));
            workflow = structuredClone({ nodes: source.nodes, connections: source.connections.filter((connection) => ids.has(connection.fromNodeId) && ids.has(connection.toNodeId)) });
        }
        const data = { title: title.trim(), coverUrl: "", tags: editing?.tags || [], data: { content: editor === "workflow" ? `${workflow?.nodes.length || 0} 个节点 · ${workflow?.connections.length || 0} 条连线` : content }, metadata: editor === "workflow" ? { resourceType: "workflow", workflow } : { resourceType: "prompt" } };
        editing ? updateAsset(editing.id, data) : addAsset({ kind: "text", ...data });
        setEditor(null); message.success("资源已保存");
    };
    const insert = async (asset: TextAsset) => {
        const workflow = workflowOf(asset);
        if (!compact) { setSending(asset); setTargetId(projects[0]?.id || ""); return; }
        if (workflow) {
            if (!onInsertWorkflow) { message.error("当前画布尚未连接工作流插入操作"); return; }
            await onInsertWorkflow(workflow);
        } else {
            if (!onInsert) { message.error("当前画布尚未连接提示词插入操作"); return; }
            await onInsert({ kind: "text", title: asset.title, content: asset.data.content });
        }
        message.success("已插入当前画布");
    };
    return <div className={`flex min-h-0 flex-col ${compact ? "h-full px-3 pb-3" : ""}`}>
        <div className="mb-3 flex flex-wrap gap-2"><Button size={compact ? "small" : "middle"} icon={<Plus className="size-3.5" />} onClick={() => edit("prompt")}>新建提示词</Button><Button size={compact ? "small" : "middle"} icon={<Workflow className="size-3.5" />} onClick={() => edit("workflow")}>保存工作流</Button></div>
        <Segmented aria-label="资源类型" block className="mb-3" value={kind} onChange={setKind} options={[{ value: "all", label: "全部" }, { value: "workflow", label: "工作流" }, { value: "prompt", label: "提示词" }]} />
        <div className="mb-4"><Input aria-label="搜索资源" value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Search className="size-4" />} placeholder="搜索资源" allowClear /></div>
        <div className={compact ? "min-h-0 flex-1 overflow-y-auto" : ""}>
            {!hydrated ? <p className="py-16 text-center text-sm text-muted-foreground">正在读取资源…</p> : !items.length ? <p className="py-16 text-center text-sm text-muted-foreground">{query ? "没有匹配的资源" : "保存提示词或工作流，随时插入画布复用"}</p> : <div className={compact ? "space-y-2" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"}>{items.map((asset) => {
                const workflow = workflowOf(asset), Icon = workflow ? Workflow : FileText;
                return <article key={asset.id} className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2"><Icon className="size-4 shrink-0 text-muted-foreground" /><h2 className="min-w-0 flex-1 truncate text-sm font-medium">{asset.title}</h2><span className="text-[11px] text-muted-foreground">{workflow ? "工作流" : "提示词"}</span></div><p className="my-3 line-clamp-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">{asset.data.content}</p><div className="flex justify-end gap-1"><Button type="text" size="small" aria-label={`编辑资源 ${asset.title}`} icon={<Pencil className="size-3.5" />} onClick={() => edit(workflow ? "workflow" : "prompt", asset)} /><Button type="text" size="small" aria-label={`删除资源 ${asset.title}`} icon={<Trash2 className="size-3.5" />} onClick={() => removeAsset(asset.id)} /><Button type="text" size="small" aria-label={`插入资源 ${asset.title}`} icon={<Send className="size-3.5" />} onClick={() => void insert(asset).catch((error) => message.error(error instanceof Error ? error.message : "插入失败"))} /></div></article>;
            })}</div>}
        </div>
        {compact && <Button className="mt-4 shrink-0" type="primary" block onClick={() => navigate("/resources")}>打开完整资源管理器</Button>}
        <Modal title={editor === "workflow" ? "保存工作流" : "编辑提示词"} open={Boolean(editor)} onCancel={() => setEditor(null)} onOk={save} modalRender={(node) => <div data-canvas-overlay data-canvas-no-zoom>{node}</div>}><div className="space-y-4 py-4"><Input aria-label="资源名称" placeholder="资源名称" value={title} onChange={(event) => setTitle(event.target.value)} />{editor === "prompt" ? <Input.TextArea aria-label="提示词内容" rows={8} value={content} onChange={(event) => setContent(event.target.value)} placeholder="输入可复用的提示词" /> : !nodes && !editing ? <Select aria-label="工作流来源画布" className="w-full" value={sourceId} onChange={setSourceId} options={projects.map((project) => ({ value: project.id, label: project.title }))} /> : <p className="text-sm text-muted-foreground">{editing ? editing.data.content : `保存当前${nodes?.length || 0} 个节点及其连线，保留配置与参考素材。`}</p>}</div></Modal>
        <Modal title="插入到画布" modalRender={(node) => <div data-canvas-overlay data-canvas-no-zoom>{node}</div>} open={Boolean(sending)} onCancel={() => setSending(null)} confirmLoading={busy} onOk={async () => { if (!sending) return; setBusy(true); try { const id = targetId || useCanvasStore.getState().createProject(); await insertLibraryItem(id, sending); setSending(null); navigate(`/canvas/${id}`); } catch (error) { message.error(error instanceof Error ? error.message : "插入失败"); } finally { setBusy(false); } }}><Select aria-label="资源目标画布" className="my-4 w-full" value={targetId} onChange={setTargetId} options={[{ value: "", label: "新建画布" }, ...projects.map((project) => ({ value: project.id, label: project.title }))]} /></Modal>
    </div>;
}
