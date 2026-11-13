import { Button, Drawer, Input, Modal, Segmented, Select, Space } from "antd";
import { Check, ChevronDown, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { guessCapability, normalizeChannelModels, type ChannelModel, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";
import { verifyChannelConnection, type ChannelVerification } from "@/services/api/image";
import { modelCapabilityOptions } from "./model-catalog";
import { ModelSelectModal } from "./model-select-modal";

export function ChannelEditorDrawer({ open, channel, onSave, onClose, inline = false, onDelete }: { open: boolean; channel: ModelChannel | null; onSave: (channel: ModelChannel) => void; onClose: () => void; inline?: boolean; onDelete?: () => void }) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState<ModelChannel | null>(channel);
    const [connectionOpen, setConnectionOpen] = useState(!channel?.apiKey || !channel?.baseUrl);
    const [refreshKey, setRefreshKey] = useState(0);
    const [editingModelName, setEditingModelName] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [verification, setVerification] = useState<ChannelVerification | undefined>();

    useEffect(() => { if (open && channel) setDraft(channel); }, [open, channel]);
    useEffect(() => { setConnectionOpen(!channel?.apiKey || !channel?.baseUrl); setRefreshKey(0); setEditingModelName(""); setVerification(undefined); }, [channel?.id]);
    if (!draft) return null;

    const protocolOptions = [
        { label: "OpenAI", value: "openai" },
        { label: "Gemini", value: "gemini" },
    ];
    const editingModel = draft.models.find((model) => model.name === editingModelName);

    const patch = (value: Partial<ModelChannel>) => {
        const next = { ...draft, ...value };
        if ("baseUrl" in value || "apiKey" in value || "apiFormat" in value) setVerification(undefined);
        setDraft(next);
        if (inline) onSave(next);
    };
    const runVerify = async () => {
        setVerifying(true);
        setVerification(undefined);
        try {
            setVerification(await verifyChannelConnection(draft));
        } catch (error) {
            setVerification({ reachable: false, status: 0, authenticated: false, modelCount: 0, detail: error instanceof Error ? error.message : String(error) });
        } finally {
            setVerifying(false);
        }
    };
    const setModels = (models: ChannelModel[]) => patch({ models: normalizeChannelModels(models) });
    const patchModel = (name: string, value: Partial<ChannelModel>) => setModels(draft.models.map((model) => model.name === name ? { ...model, ...value } : model));
    const applySelection = (names: string[], fetchedModels: ChannelModel[] = []) => {
        const existing = new Map(draft.models.map((model) => [model.name, model]));
        setModels(names.map((name) => existing.get(name) || fetchedModels.find((model) => model.name === name) || { name, capability: guessCapability(name) }));
    };
    const save = () => { onSave({ ...draft, name: draft.name.trim() || t("config.channels.unnamed"), models: normalizeChannelModels(draft.models) }); onClose(); };

    const content = <>
        <header className="mb-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h2 className="truncate text-base font-semibold">{draft.name || "未命名渠道"}</h2><span className={`rounded-full px-2 py-1 text-[11px] ${draft.apiKey.trim() && draft.baseUrl.trim() ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>{draft.apiKey.trim() && draft.baseUrl.trim() ? "已配置" : "待配置"}</span>{inline && onDelete && <Button type="text" size="small" danger className="dark:!bg-slate-100 dark:hover:!bg-white" aria-label={`删除渠道 ${draft.name}`} icon={<Trash2 className="size-4" />} onClick={onDelete} />}</div><p className="mt-2 text-xs text-muted-foreground">{draft.models.length} 个已选模型{inline && <span className="ml-3 inline-flex items-center gap-1"><Check className="size-3" />自动保存</span>}</p></div>
                <div className="flex gap-2"><Button loading={verifying} onClick={runVerify}>一键验证</Button><Button type="primary" icon={<RefreshCw className="size-4" />} onClick={() => setRefreshKey((key) => key + 1)}>更新模型</Button><Button onClick={() => setConnectionOpen(!connectionOpen)}>配置连接 <ChevronDown className={`size-3.5 transition-transform ${connectionOpen ? "rotate-180" : ""}`} /></Button></div>
            </div>
            {connectionOpen && <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                <label><span className="mb-1.5 block text-xs text-muted-foreground">渠道名称</span><Input aria-label="渠道名称" value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></label>
                <label><span className="mb-1.5 block text-xs text-muted-foreground">调用协议</span><Select aria-label="渠道调用协议" className="w-full" value={draft.apiFormat} options={protocolOptions} onChange={(value) => patch({ apiFormat: value as ModelChannel["apiFormat"] })} /></label>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs text-muted-foreground">接口地址 / Base URL</span><Input aria-label="渠道接口地址" value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} placeholder="https://api.example.com" /></label>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs text-muted-foreground">独立 API Key</span><Input.Password aria-label="渠道独立 API Key" value={draft.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} placeholder="填写此渠道的 API Key" autoComplete="off" /></label>
                {verification && <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs sm:col-span-2" role="status">
                    <div className="flex gap-2">
                        <span className={`mt-1 size-1.5 shrink-0 rounded-full ${verification.reachable ? "bg-blue-500" : "bg-destructive"}`} />
                        <span className="w-16 shrink-0 text-muted-foreground">地址检测</span>
                        <span className={verification.reachable ? "" : "text-destructive"}>{verification.reachable ? `地址可达（HTTP ${verification.status}）` : `地址不可达：${verification.detail || "网络错误"}`}</span>
                    </div>
                    <div className="mt-2 flex gap-2">
                        <span className={`mt-1 size-1.5 shrink-0 rounded-full ${verification.authenticated ? "bg-blue-500" : "bg-amber-500"}`} />
                        <span className="w-16 shrink-0 text-muted-foreground">协议握手</span>
                        <span className={verification.authenticated ? "" : "text-amber-600 dark:text-amber-400"}>{verification.authenticated ? `握手成功，发现 ${verification.modelCount} 个模型` : verification.reachable ? `握手失败：${verification.detail || `HTTP ${verification.status}`}` : "地址不可达，未握手"}</span>
                    </div>
                </div>}
            </div>}
        </header>
        <ModelSelectModal embedded open={open} channel={draft} selectedNames={draft.models.map((model) => model.name)} refreshKey={refreshKey} onConfirm={applySelection} onClose={() => {}} onEditModel={setEditingModelName} />
        <Modal open={Boolean(editingModel)} title="编辑模型" onCancel={() => setEditingModelName("")} footer={<Button type="primary" onClick={() => setEditingModelName("")}>完成</Button>}>
            {editingModel && <div className="space-y-5 py-4"><div className="break-all text-sm font-medium">{editingModel.name}</div><label className="block"><span className="mb-2 block text-xs text-muted-foreground">模型能力</span><Segmented value={editingModel.capability} options={modelCapabilityOptions.filter((option) => option.value !== "all")} onChange={(value) => patchModel(editingModel.name, { capability: value as ModelCapability })} /></label></div>}
        </Modal>
    </>;

    return inline ? <section className="min-w-0">{content}</section> : <Drawer open={open} width={700} title="编辑渠道" onClose={onClose} styles={{ body: { paddingTop: 16 } }} extra={<Space><Button onClick={onClose}>取消</Button><Button type="primary" onClick={save}>保存</Button></Space>}>{content}</Drawer>;
}
