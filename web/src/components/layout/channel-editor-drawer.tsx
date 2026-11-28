import { Button, Drawer, Input, Modal, Segmented, Select, Space } from "antd";
import { Check, ChevronDown, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { guessCapability, modelDisplayName, normalizeChannelModels, type ChannelModel, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";
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
        { label: "Sand AI (MAGI-2)", value: "sand" },
        { label: "AutoDL ComfyUI", value: "autodl" },
        { label: "RouterAPI (Seedance)", value: "routerapi" },
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
        <header className="mb-4 rounded-3xl border border-white/60 bg-white/45 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.045]">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h2 className="truncate text-base font-semibold">{draft.name || "未命名渠道"}</h2>{draft.fixed && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">固定渠道</span>}<span className={`rounded-full px-2 py-1 text-[11px] ${draft.apiKey.trim() && draft.baseUrl.trim() ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>{draft.apiKey.trim() && draft.baseUrl.trim() ? "已配置" : "待配置"}</span>{inline && onDelete && !draft.fixed && <Button type="text" size="small" danger className="dark:!bg-slate-100 dark:hover:!bg-white" aria-label={`删除渠道 ${draft.name}`} icon={<Trash2 className="size-4" />} onClick={onDelete} />}</div><p className="mt-2 text-xs text-muted-foreground"><span key={draft.models.length} className="bf-digit-roll font-mono text-primary">{draft.models.length}</span> 个已选模型{inline && <span className="ml-3 inline-flex items-center gap-1"><Check className="size-3" />自动保存</span>}</p></div>
                <div className="flex flex-wrap gap-2">{draft.apiKeyUrl && <Button href={draft.apiKeyUrl} target="_blank" rel="noopener noreferrer" icon={<ExternalLink className="size-3.5" />}>获取 API Key</Button>}<Button loading={verifying} onClick={runVerify}>一键验证</Button><Button type="primary" icon={<RefreshCw className="size-4" />} onClick={() => setRefreshKey((key) => key + 1)}>更新模型</Button><Button onClick={() => setConnectionOpen(!connectionOpen)}>配置连接 <ChevronDown className={`size-3.5 transition-transform ${connectionOpen ? "rotate-180" : ""}`} /></Button></div>
            </div>
            {connectionOpen && <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                <label><span className="mb-1.5 block text-xs text-muted-foreground">渠道名称</span><Input aria-label="渠道名称" value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></label>
                <label><span className="mb-1.5 block text-xs text-muted-foreground">调用协议</span><Select aria-label="渠道调用协议" className="w-full" value={draft.apiFormat} options={protocolOptions} onChange={(value) => patch({ apiFormat: value as ModelChannel["apiFormat"] })} /></label>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs text-muted-foreground">接口地址 / Base URL</span><Input aria-label="渠道接口地址" value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} placeholder="https://api.example.com" /></label>
                <label className="sm:col-span-2"><span className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>独立 API Key</span>{draft.apiKeyUrl && <a href={draft.apiKeyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[#0ea977] hover:underline dark:text-[#37d39b]"><span>前往官网获取 API Key</span><ExternalLink className="size-3" /></a>}</span><Input.Password aria-label="渠道独立 API Key" value={draft.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} placeholder={draft.apiFormat === "autodl" ? "填写 AutoDL 令牌管理中 ComfyUI 分组的原始 Token（无需 Bearer）" : draft.apiFormat === "sand" ? "填写 Sand AI 开放平台 API Key" : draft.apiFormat === "routerapi" ? "填写 RouterAPI 控制台创建的 seedance 分组令牌（sk-...）" : draft.id === "fixed-yingman-video" ? "填写萤漫「设置 → API 密钥」创建的密钥（sk-mc-...）" : "填写此渠道的 API Key"} autoComplete="off" />{draft.apiFormat === "sand" && <span className="mt-1.5 block text-[11px] text-muted-foreground">Sand AI 协议：默认走原生 v2（/v2/generations + /v1/assets），首尾帧模式自动切换 Ark 兼容接口，固定 1080p、时长 4–30s。</span>}{draft.apiFormat === "autodl" && <span className="mt-1.5 block text-[11px] text-muted-foreground">AutoDL ComfyUI 协议：使用 ComfyUI 分组原始 Token 鉴权，提交前自动读取工作流 input_rules；点击上方「更新模型」可同步官网全部工作流。</span>}{draft.apiFormat === "routerapi" && <span className="mt-1.5 block text-[11px] text-muted-foreground">RouterAPI 协议：自动走 Seedance 2.0/2.5 渠道报价、素材秒传/分片上传与按秒视频生成接口（支持图/视频/音频参考）；同时兼容标准 OpenAI 接口，国内网络可将地址改为 https://routerapi.quanshihao.com。</span>}{draft.id === "fixed-yingman-video" && <span className="mt-1.5 block text-[11px] text-muted-foreground">萤漫协议：标准 OpenAI 视频接口（POST /v1/videos multipart/form-data，Bearer 鉴权），已预置 7 款 H3 / Seedance 2.5 视频模型，支持首尾帧与多模态参考。</span>}</label>
                {verification && <div className="rounded-xl border border-white/50 bg-white/30 p-3 text-xs backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] sm:col-span-2" role="status">
                    <div className="flex gap-2">
                        <span className={`mt-1 size-1.5 shrink-0 rounded-full ${verification.reachable ? "bg-[#0ea977]" : "bg-destructive"}`} />
                        <span className="w-16 shrink-0 text-muted-foreground">地址检测</span>
                        <span className={verification.reachable ? "" : "text-destructive"}>{verification.reachable ? `地址可达（HTTP ${verification.status}）` : `地址不可达：${verification.detail || "网络错误"}`}</span>
                    </div>
                    <div className="mt-2 flex gap-2">
                        <span className={`mt-1 size-1.5 shrink-0 rounded-full ${verification.authenticated ? "bg-[#0ea977]" : "bg-amber-500"}`} />
                        <span className="w-16 shrink-0 text-muted-foreground">协议握手</span>
                        <span className={verification.authenticated ? "" : "text-amber-600 dark:text-amber-400"}>{verification.authenticated ? `握手成功，发现 ${verification.modelCount} 个模型` : verification.reachable ? `握手失败：${verification.detail || `HTTP ${verification.status}`}` : "地址不可达，未握手"}</span>
                    </div>
                </div>}
            </div>}
        </header>
        <ModelSelectModal embedded open={open} channel={draft} selectedNames={draft.models.map((model) => model.name)} refreshKey={refreshKey} onConfirm={applySelection} onClose={() => {}} onEditModel={setEditingModelName} />
        <Modal open={Boolean(editingModel)} title="编辑模型" onCancel={() => setEditingModelName("")} footer={<Button type="primary" onClick={() => setEditingModelName("")}>完成</Button>}>
            {editingModel && <div className="space-y-5 py-4"><div><div className="break-all text-sm font-medium">{modelDisplayName(editingModel.name, editingModel.label)}</div>{modelDisplayName(editingModel.name, editingModel.label) !== editingModel.name && <div className="mt-1 break-all font-mono text-xs text-muted-foreground">请求模型 ID：{editingModel.name}</div>}</div><label className="block"><span className="mb-2 block text-xs text-muted-foreground">模型能力</span><Segmented value={editingModel.capability} options={modelCapabilityOptions.filter((option) => option.value !== "all")} onChange={(value) => patchModel(editingModel.name, { capability: value as ModelCapability })} /></label></div>}
        </Modal>
    </>;

    return inline ? <section className="min-w-0">{content}</section> : <Drawer open={open} width={700} title="编辑渠道" onClose={onClose} styles={{ body: { paddingTop: 16 } }} extra={<Space><Button onClick={onClose}>取消</Button><Button type="primary" onClick={save}>保存</Button></Space>}>{content}</Drawer>;
}
