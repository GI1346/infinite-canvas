import { Button, Drawer, Input, Modal, Segmented, Select, Space } from "antd";
import { Check, ChevronDown, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { guessCapability, normalizeChannelModels, type ApiCallFormat, type ChannelModel, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";
import { useCallProtocolStore } from "@/stores/use-call-protocol-store";
import { modelCapabilityOptions } from "./model-catalog";
import { ModelScriptEditor } from "./model-script-editor";
import { ModelSelectModal } from "./model-select-modal";

type ScriptTarget = { name: string; capability: ModelCapability; value: string };

export function ChannelEditorDrawer({ open, channel, onSave, onClose, inline = false, onDelete }: { open: boolean; channel: ModelChannel | null; onSave: (channel: ModelChannel) => void; onClose: () => void; inline?: boolean; onDelete?: () => void }) {
    const { t } = useTranslation();
    const protocols = useCallProtocolStore((state) => state.protocols);
    const [draft, setDraft] = useState<ModelChannel | null>(channel);
    const [connectionOpen, setConnectionOpen] = useState(!channel?.apiKey || !channel?.baseUrl);
    const [refreshKey, setRefreshKey] = useState(0);
    const [scriptTarget, setScriptTarget] = useState<ScriptTarget | null>(null);
    const [editingModelName, setEditingModelName] = useState("");

    useEffect(() => { if (open && channel) setDraft(channel); }, [open, channel]);
    useEffect(() => { setConnectionOpen(!channel?.apiKey || !channel?.baseUrl); setRefreshKey(0); setEditingModelName(""); setScriptTarget(null); }, [channel?.id]);
    if (!draft) return null;

    const protocolOptions = [
        { label: "OpenAI", value: "openai" },
        { label: "Gemini", value: "gemini" },
        ...(draft.protocolId && !protocols.some((protocol) => protocol.id === draft.protocolId) ? [{ label: `缺失：${draft.protocolId}`, value: `protocol:${draft.protocolId}` }] : []),
        ...protocols.map((protocol) => ({ label: `${protocol.label}（${t(`config.channelEditor.capabilities.${protocol.capability}`)}）`, value: `protocol:${protocol.id}` })),
    ];
    const selectedProtocol = draft.protocolId ? `protocol:${draft.protocolId}` : draft.apiFormat;
    const editingModel = draft.models.find((model) => model.name === editingModelName);

    const patch = (value: Partial<ModelChannel>) => {
        const next = { ...draft, ...value };
        setDraft(next);
        if (inline) onSave(next);
    };
    const setModels = (models: ChannelModel[]) => patch({ models: normalizeChannelModels(models) });
    const patchModel = (name: string, value: Partial<ChannelModel>) => setModels(draft.models.map((model) => model.name === name ? { ...model, ...value } : model));
    const changeProtocol = (value: string) => value.startsWith("protocol:") ? patch({ protocolId: value.slice("protocol:".length), apiFormat: "openai" }) : patch({ apiFormat: value as ApiCallFormat, protocolId: undefined });
    const applySelection = (names: string[], fetchedModels: ChannelModel[] = []) => {
        const existing = new Map(draft.models.map((model) => [model.name, model]));
        setModels(names.map((name) => existing.get(name) || fetchedModels.find((model) => model.name === name) || { name, capability: guessCapability(name) }));
    };
    const save = () => { onSave({ ...draft, name: draft.name.trim() || t("config.channels.unnamed"), models: normalizeChannelModels(draft.models) }); onClose(); };

    const content = <>
        <header className="mb-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h2 className="truncate text-base font-semibold">{draft.name || "未命名渠道"}</h2><span className={`rounded-full px-2 py-1 text-[11px] ${draft.apiKey.trim() && draft.baseUrl.trim() ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>{draft.apiKey.trim() && draft.baseUrl.trim() ? "已配置" : "待配置"}</span>{inline && onDelete && <Button type="text" size="small" danger className="dark:!bg-slate-100 dark:hover:!bg-white" aria-label={`删除渠道 ${draft.name}`} icon={<Trash2 className="size-4" />} onClick={onDelete} />}</div><p className="mt-2 text-xs text-muted-foreground">{draft.models.length} 个已选模型{inline && <span className="ml-3 inline-flex items-center gap-1"><Check className="size-3" />自动保存</span>}</p></div>
                <div className="flex gap-2"><Button type="primary" icon={<RefreshCw className="size-4" />} onClick={() => setRefreshKey((key) => key + 1)}>更新模型</Button><Button onClick={() => setConnectionOpen(!connectionOpen)}>配置连接 <ChevronDown className={`size-3.5 transition-transform ${connectionOpen ? "rotate-180" : ""}`} /></Button></div>
            </div>
            {connectionOpen && <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                <label><span className="mb-1.5 block text-xs text-muted-foreground">渠道名称</span><Input aria-label="渠道名称" value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></label>
                <label><span className="mb-1.5 block text-xs text-muted-foreground">调用协议</span><Select aria-label="渠道调用协议" className="w-full" value={selectedProtocol} options={protocolOptions} onChange={changeProtocol} /></label>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs text-muted-foreground">接口地址 / Base URL</span><Input aria-label="渠道接口地址" value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} placeholder="https://api.example.com" /></label>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs text-muted-foreground">独立 API Key</span><Input.Password aria-label="渠道独立 API Key" value={draft.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} placeholder="填写此渠道的 API Key" autoComplete="off" /></label>
            </div>}
        </header>
        <ModelSelectModal embedded open={open} channel={draft} selectedNames={draft.models.map((model) => model.name)} refreshKey={refreshKey} onConfirm={applySelection} onClose={() => {}} onEditModel={setEditingModelName} />
        <Modal open={Boolean(editingModel)} title="编辑模型" onCancel={() => setEditingModelName("")} footer={<Button type="primary" onClick={() => setEditingModelName("")}>完成</Button>}>
            {editingModel && <div className="space-y-5 py-4"><div className="break-all text-sm font-medium">{editingModel.name}</div><label className="block"><span className="mb-2 block text-xs text-muted-foreground">模型能力</span><Segmented value={editingModel.capability} options={modelCapabilityOptions.filter((option) => option.value !== "all")} onChange={(value) => patchModel(editingModel.name, { capability: value as ModelCapability, protocolId: undefined })} /></label><label className="block"><span className="mb-2 block text-xs text-muted-foreground">模型调用协议</span><Select aria-label={`${editingModel.name} 模型协议`} className="w-full" placeholder={editingModel.script ? "使用模型调用脚本" : "继承渠道协议"} allowClear value={editingModel.protocolId} options={[...(editingModel.protocolId && !protocols.some((protocol) => protocol.id === editingModel.protocolId) ? [{ value: editingModel.protocolId, label: `缺失：${editingModel.protocolId}` }] : []), ...protocols.filter((protocol) => protocol.capability === editingModel.capability).map((protocol) => ({ value: protocol.id, label: protocol.label }))]} onChange={(protocolId) => patchModel(editingModel.name, { protocolId })} /></label><div><Button disabled={Boolean(editingModel.protocolId)} onClick={() => setScriptTarget({ name: editingModel.name, capability: editingModel.capability, value: editingModel.script || "" })}>{editingModel.script ? "编辑调用脚本" : "配置调用脚本"}</Button><p className="mt-2 text-xs text-muted-foreground">模型绑定的协议或脚本优先于渠道协议。</p></div></div>}
        </Modal>
        <ModelScriptEditor open={Boolean(scriptTarget)} capability={scriptTarget?.capability || "text"} modelName={scriptTarget?.name || ""} value={scriptTarget?.value || ""} onSave={(script) => scriptTarget && patchModel(scriptTarget.name, { script: script || undefined })} onClose={() => setScriptTarget(null)} />
    </>;

    return inline ? <section className="min-w-0">{content}</section> : <Drawer open={open} width={700} title="编辑渠道" onClose={onClose} styles={{ body: { paddingTop: 16 } }} extra={<Space><Button onClick={onClose}>取消</Button><Button type="primary" onClick={save}>保存</Button></Space>}>{content}</Drawer>;
}
