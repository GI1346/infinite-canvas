import { App, Button, Input, Modal, Segmented, Switch } from "antd";
import localforage from "localforage";
import { Check, ChevronDown, Pencil, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { fetchChannelModelDetails } from "@/services/api/image";
import { FIXED_CHANNELS, guessCapability, modelDisplayName, useConfigStore, type ModelCapability, type ModelChannel, type ChannelModel } from "@/stores/use-config-store";
import { groupModelFamilies, modelCapabilityOptions } from "./model-catalog";

const catalogStorage = localforage.createInstance({ name: "infinite-canvas", storeName: "channel_model_catalogs" });
type CachedChannelCatalog = ChannelModel[] | { synced: boolean; models: ChannelModel[] };

type Props = { open: boolean; channel: ModelChannel | null; selectedNames: string[]; fetchOnOpen?: boolean; onConfirm: (names: string[], details: ChannelModel[]) => void; onClose: () => void; embedded?: boolean; refreshKey?: number; onEditModel?: (name: string) => void };

export function ModelSelectModal({ open, channel, selectedNames, fetchOnOpen = false, onConfirm, onClose, embedded = false, refreshKey = 0, onEditModel }: Props) {
    const { message } = App.useApp();
    const requestId = useRef(0);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const [details, setDetails] = useState<ChannelModel[]>([]);
    const [syncedCatalog, setSyncedCatalog] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const selectedRef = useRef(selected);
    selectedRef.current = selected;
    const [capability, setCapability] = useState<ModelCapability | "all">("all");
    const [onlySelected, setOnlySelected] = useState(false);
    const [search, setSearch] = useState("");
    const [manual, setManual] = useState("");
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const catalogKey = channel ? `${channel.id}:${channel.apiFormat}:${channel.baseUrl.trim()}` : "";
    const cacheModels = (models: ChannelModel[], synced = syncedCatalog) => {
        if (catalogKey) void catalogStorage.setItem<CachedChannelCatalog>(catalogKey, { synced, models }).catch(() => message.warning("模型列表缓存失败，已选模型仍会保存。"));
    };

    useEffect(() => {
        if (!open) return;
        setDetails(channel?.models || []);
        setSyncedCatalog(false);
        setSelected(new Set(selectedNames));
        setCapability(embedded ? channel?.models[0]?.capability || "image" : "all");
        setOnlySelected(false);
        setSearch("");
        setManual("");
        setLoading(false);
        setLoadError("");
        setCollapsed(new Set());
        if (fetchOnOpen) void fetchModels();
        return () => { requestId.current += 1; };
    }, [open, channel?.id]);

    useEffect(() => {
        if (!open || !catalogKey) return;
        const id = requestId.current;
        let active = true;
        void catalogStorage.getItem<CachedChannelCatalog>(catalogKey).then((cached) => {
            if (!active || id !== requestId.current || !cached) return;
            if (Array.isArray(cached)) {
                setDetails(cached);
                setSyncedCatalog(false);
            } else if (Array.isArray(cached.models)) {
                setDetails(cached.models);
                setSyncedCatalog(Boolean(cached.synced));
            }
        }).catch(() => undefined);
        return () => { active = false; requestId.current += 1; setLoading(false); };
    }, [open, catalogKey, channel?.apiKey]);
    useEffect(() => { if (open && embedded && refreshKey) void fetchModels(); }, [refreshKey]);
    useEffect(() => { if (embedded) { const next = new Set(selectedNames); selectedRef.current = next; setSelected(next); } }, [embedded, selectedNames.join("\n")]);

    const fixedPresetModels = channel?.id ? FIXED_CHANNELS.find((item) => item.id === channel.id)?.models || [] : [];
    const channelOverrideMap = new Map((channel?.models || []).map((model) => [model.name, model]));
    const baseModels = syncedCatalog ? details : [...fixedPresetModels, ...details, ...(channel?.models || [])];
    const models = Array.from(
        new Map(
            baseModels.map((model) => {
                const override = channelOverrideMap.get(model.name);
                return [model.name, override ? { ...model, ...override } : model];
            }),
        ).values(),
    );
    const keyword = search.trim().toLowerCase();
    const visible = models.filter((model) => (capability === "all" || model.capability === capability) && (!onlySelected || selected.has(model.name)) && (model.name.toLowerCase().includes(keyword) || modelDisplayName(model.name, model.label).toLowerCase().includes(keyword)));
    const visibleSelected = visible.filter((model) => selected.has(model.name)).length;
    const groups = groupModelFamilies(visible);
    const defaultModelKey = capability === "all" ? null : ({ text: "textModel", image: "imageModel", video: "videoModel", audio: "audioModel" } as const)[capability];
    const toggleModels = (names: string[], checked: boolean, source = models) => {
        const next = new Set(selected);
        names.forEach((name) => checked ? next.add(name) : next.delete(name));
        setDetails(source);
        cacheModels(source);
        setSelected(next);
        if (embedded) onConfirm(source.filter((model) => next.has(model.name)).map((model) => model.name), source);
    };
    const addManual = () => {
        const name = manual.trim();
        if (!name) return;
        const source = models.some((model) => model.name === name) ? models : [...models, { name, capability: capability === "all" ? guessCapability(name) : capability }];
        setDetails(source);
        toggleModels([name], true, source);
        setManual("");
        setSearch("");
    };
    async function fetchModels() {
        if (!channel?.baseUrl.trim() || !channel.apiKey.trim()) { message.error("请先填写当前渠道的接口地址和独立 API Key"); return; }
        const id = ++requestId.current;
        setLoading(true);
        setLoadError("");
        try {
            const fetched = await fetchChannelModelDetails(channel);
            if (id !== requestId.current) return;
            const existingMap = new Map(models.map((model) => [model.name, model]));
            const nextModels = Array.from(
                new Map(
                    fetched.map((model) => {
                        const prev = existingMap.get(model.name);
                        const label = model.label || prev?.label;
                        return [model.name, { ...model, ...(label ? { label } : {}) }];
                    }),
                ).values(),
            );
            const currentSelected = selectedRef.current;
            const fetchedNames = new Set(nextModels.map((model) => model.name));
            const nextSelectedNames = nextModels.filter((model) => currentSelected.has(model.name)).map((model) => model.name);
            const removedCount = Array.from(currentSelected).filter((name) => !fetchedNames.has(name)).length;
            setSyncedCatalog(true);
            setDetails(nextModels);
            cacheModels(nextModels, true);
            const nextSelectedSet = new Set(nextSelectedNames);
            selectedRef.current = nextSelectedSet;
            setSelected(nextSelectedSet);
            if (embedded && (removedCount > 0 || nextSelectedNames.length > 0)) {
                onConfirm(nextSelectedNames, nextModels);
            }
            if (removedCount > 0) {
                message.success(`已同步服务端 ${nextModels.length} 个模型，并自动取消勾选 ${removedCount} 个已下线模型`);
            } else {
                message.success(`已同步服务端 ${nextModels.length} 个模型`);
            }
        } catch (error) {
            if (id === requestId.current) { const reason = error instanceof Error ? error.message : "更新模型失败"; setLoadError(reason); message.error(reason); }
        } finally {
            if (id === requestId.current) setLoading(false);
        }
    }
    const confirm = () => { onConfirm(models.filter((model) => selected.has(model.name)).map((model) => model.name), models); onClose(); };
    const content = <>
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-sm font-semibold">模型筛选</h3><p className="mt-1 text-xs text-muted-foreground">共 {models.length} 个模型 · 已选 <span key={selected.size} className="bf-digit-roll font-mono text-primary">{selected.size}</span> 个</p></div>
            {!embedded && <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void fetchModels()}>更新模型</Button>}
        </div>
        <div className="mt-5 flex gap-2 border-t border-border pt-4"><Input aria-label="手动添加模型 ID" value={manual} onChange={(event) => setManual(event.target.value)} onPressEnter={addManual} placeholder="手动输入模型 ID" /><Button icon={<Plus className="size-4" />} onClick={addManual}>添加模型</Button></div>
        <div className="my-5 border-b border-border pb-4"><Segmented aria-label="模型类型" value={capability} options={modelCapabilityOptions.filter((option) => !embedded || option.value !== "all").map((option) => ({ ...option, label: <span>{option.label} <span className="ml-1 text-xs opacity-60">{models.filter((model) => option.value === "all" || model.capability === option.value).length}</span></span> }))} onChange={(value) => setCapability(value as ModelCapability | "all")} /></div>
        <div className="my-4 flex flex-wrap items-center gap-3">
            <Input aria-label="搜索模型" className="min-w-48 flex-1" prefix={<Search className="size-4" />} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索模型名称或 ID" allowClear />
            <label className="flex shrink-0 items-center gap-2 text-xs"><Switch size="small" checked={onlySelected} onChange={setOnlySelected} />只看已选</label>
            <Button size="small" disabled={!visible.length || visibleSelected === visible.length} onClick={() => toggleModels(visible.map((model) => model.name), true)}>选择当前结果</Button>
            <Button size="small" disabled={!models.some((model) => (capability === "all" || model.capability === capability) && selected.has(model.name))} onClick={() => toggleModels(models.filter((model) => capability === "all" || model.capability === capability).map((model) => model.name), false)}>清空本类</Button>
        </div>
        {embedded && defaultModelKey && capability !== "all" && <div className="mb-5 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4"><span className="text-xs text-muted-foreground">全局默认（跨接口）</span><ModelPicker config={config} value={config[defaultModelKey]} onChange={(model) => updateConfig(defaultModelKey, model)} capability={capability} /></div>}
        {loadError && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 text-sm text-red-500"><span>{loadError}</span><Button size="small" onClick={() => void fetchModels()}>重试</Button></div>}
        <div className="min-h-48 space-y-3">
            {groups.map((group) => {
                const count = group.models.filter((model) => selected.has(model.name)).length;
                return <section key={group.family} className="overflow-hidden rounded-2xl border border-white/50 bg-white/35 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="flex items-center justify-between gap-3 px-4 py-3"><button type="button" className="flex items-center gap-2 text-left" onClick={() => setCollapsed((current) => { const next = new Set(current); next.has(group.family) ? next.delete(group.family) : next.add(group.family); return next; })}><ChevronDown className={`size-4 text-muted-foreground transition-transform ${collapsed.has(group.family) ? "-rotate-90" : ""}`} /><span><strong className="block text-xs">{group.family}</strong><span className="mt-1 block text-[11px] text-muted-foreground">{group.models.length} 个版本 · 已选 <span key={count} className="bf-digit-roll font-mono text-primary">{count}</span></span></span></button><div className="flex gap-2"><Button size="small" disabled={count === group.models.length} onClick={() => toggleModels(group.models.map((model) => model.name), true)}>全选本组</Button><Button size="small" disabled={!count} onClick={() => toggleModels(group.models.map((model) => model.name), false)}>清空本组</Button></div></div>
                    {!collapsed.has(group.family) && <div className="flex flex-wrap gap-2 border-t border-border p-3">{group.models.map((model) => {
                        const checked = selected.has(model.name);
                        const displayName = modelDisplayName(model.name, model.label);
                        return <div key={model.name} title={displayName !== model.name ? `${displayName} (${model.name})` : model.name} className={`flex max-w-full items-center rounded-lg border text-sm transition ${checked ? "border-[#0ea977] bg-[#0ea977] text-white shadow-xs hover:bg-[#12896a] dark:border-[#37d39b]/45 dark:bg-[#0ea977]/22 dark:text-[#37d39b] dark:hover:bg-[#0ea977]/32" : "border-border bg-background hover:border-muted-foreground"}`}><button type="button" role="checkbox" aria-checked={checked} aria-label={displayName} className="bf-mag-btn flex min-w-0 items-center gap-2 px-3 py-2 text-left" onClick={() => toggleModels([model.name], !checked)}>{checked && <Check className="size-3.5 shrink-0" />}<span className="break-all">{displayName}</span></button>{checked && onEditModel && <button type="button" className="mr-1 rounded p-1.5 opacity-70 hover:opacity-100" aria-label={`编辑 ${displayName}`} onClick={() => onEditModel(model.name)}><Pencil className="size-3.5" /></button>}</div>;
                    })}</div>}
                </section>;
            })}
            {!visible.length && <div className="py-12 text-center text-sm text-muted-foreground">{loading ? "正在读取当前渠道的模型…" : "没有匹配的模型，可更新列表或手动添加"}</div>}
        </div>

    </>;
    return embedded ? <section className="rounded-3xl border border-white/60 bg-white/45 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.045]">{content}</section> : <Modal open={open} width={920} centered onCancel={onClose} title={<div className="flex items-baseline gap-3"><span>编辑模型</span><span className="text-xs font-normal text-muted-foreground">{channel?.name} · 已选 {selected.size} / {models.length}</span></div>} styles={{ body: { maxHeight: "68vh", overflowY: "auto" } }} footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>取消</Button><Button type="primary" onClick={confirm}>保存选择</Button></div>}>{content}</Modal>;
}