import { App, Button, Modal, Tabs } from "antd";
import { Download, Plus, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { ChannelEditorDrawer } from "@/components/layout/channel-editor-drawer";
import { ConfigProtocolCenter } from "@/components/layout/config-protocol-center";
import { ConfigLocalStorage } from "@/components/layout/config-local-storage";
import { useCallProtocolStore } from "@/stores/use-call-protocol-store";
import { exportAppConfig, importAppConfig } from "@/services/config-file";
import { createModelChannel, modelOptionsFromChannels, normalizeModelOptionValue, selectableModelsByCapability, useConfigStore, type AiConfig, type ConfigTabKey, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";

type ModelGroup = {
    capability: ModelCapability;
    modelKey: "imageModel" | "videoModel" | "textModel" | "audioModel";
    labelKey: string;
};

const modelGroups: ModelGroup[] = [
    { capability: "image", modelKey: "imageModel", labelKey: "config.preferences.defaultImageModel" },
    { capability: "video", modelKey: "videoModel", labelKey: "config.preferences.defaultVideoModel" },
    { capability: "text", modelKey: "textModel", labelKey: "config.preferences.defaultTextModel" },
    { capability: "audio", modelKey: "audioModel", labelKey: "config.preferences.defaultAudioModel" },
];

export function AppConfigPanel({ showDoneButton = false, initialTab = "channels", section = "all" }: { showDoneButton?: boolean; initialTab?: ConfigTabKey; section?: "all" | "models" | "system" }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const configInputRef = useRef<HTMLInputElement>(null);
    const [activeTab, setActiveTab] = useState<ConfigTabKey>(["channels", "protocols", "local-storage"].includes(initialTab) ? initialTab : "channels");
    const [editingChannelId, setEditingChannelId] = useState("");
    const config = useConfigStore((state) => state.config);
    const protocols = useCallProtocolStore((state) => state.protocols);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const editingChannel = config.channels.find((channel) => channel.id === editingChannelId) || config.channels[0] || null;
    useEffect(() => setActiveTab(["channels", "protocols", "local-storage"].includes(initialTab) ? initialTab : "channels"), [initialTab]);

    const saveConfig = (nextConfig: AiConfig) => {
        (Object.keys(nextConfig) as Array<keyof AiConfig>).forEach((key) => updateConfig(key, nextConfig[key]));
    };

    const finishConfig = () => {
        const ready = config.channels.some((channel) => channel.baseUrl.trim() && channel.apiKey.trim() && channel.models.length);
        setConfigDialogOpen(false);
        if (!ready) return;
        message.success(t(shouldPromptContinue ? "config.savedContinue" : "config.saved"));
        clearPromptContinue();
    };

    const loadConfigFile = async (file: File) => {
        try {
            await importAppConfig(file);
            message.success(t("config.imported"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.importFailed"));
        } finally {
            if (configInputRef.current) configInputRef.current.value = "";
        }
    };

    const updateChannels = (channels: ModelChannel[]) => saveConfig(withChannels(config, channels));

    const addChannel = () => {
        const channel = createModelChannel({ name: t("config.channels.numberedName", { count: config.channels.length + 1 }) });
        updateChannels([...config.channels, channel]);
        setEditingChannelId(channel.id);
    };

    const deleteChannel = (id: string) => {
        if (config.channels.length <= 1) {
            message.warning(t("config.channels.keepOne"));
            return;
        }
        updateChannels(config.channels.filter((channel) => channel.id !== id));
    };

    const saveChannel = (channel: ModelChannel) => {
        updateChannels(config.channels.map((item) => (item.id === channel.id ? channel : item)));
    };

    return (
        <>
            {section !== "models" && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div className="text-xs text-stone-500">{t("config.fileSecurity")}</div>
                <div className="flex gap-2">
                    <Button icon={<Upload className="size-4" />} onClick={() => configInputRef.current?.click()}>
                        {t("config.import")}
                    </Button>
                    <Button icon={<Download className="size-4" />} onClick={exportAppConfig}>
                        {t("config.export")}
                    </Button>
                    <input ref={configInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => event.target.files?.[0] && void loadConfigFile(event.target.files[0])} />
                </div>
            </div>}
            <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as ConfigTabKey)}
                items={[
                    { key: "protocols", label: "协议中心", children: <ConfigProtocolCenter /> },
                    {
                        key: "channels",
                        label: t("config.tabs.channels"),
                        children: (
                            <>
                            <div className={`grid min-h-[400px] gap-4 lg:grid-cols-[240px_minmax(0,1fr)] ${section === "models" ? "lg:h-[calc(100dvh-190px)]" : "lg:h-[560px]"}`}>
                                <aside className="flex min-h-0 flex-col rounded-3xl border border-border bg-background p-3 shadow-sm">
                                    <div className="mb-3 flex items-center justify-between px-2"><span className="text-sm font-semibold">接口</span><Button shape="circle" aria-label="新增渠道" icon={<Plus className="size-4" />} onClick={addChannel} /></div>
                                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">{config.channels.map((channel) => {
                                        const active = editingChannelId !== "$defaults" && editingChannel?.id === channel.id;
                                        const ready = Boolean(channel.apiKey.trim() && channel.baseUrl.trim());
                                        return <button key={channel.id} type="button" aria-pressed={active} style={active ? { backgroundColor: "#101828", color: "#ffffff", borderColor: "#101828" } : undefined} className={`w-full rounded-2xl border px-3 py-3.5 text-left transition ${active ? "border-foreground bg-foreground text-background" : "border-border bg-muted/20 hover:bg-muted/50"}`} onClick={() => setEditingChannelId(channel.id)}><span className="flex items-center justify-between gap-2"><strong className="min-w-0 truncate text-sm">{channel.name || "未命名渠道"}</strong><span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] ${active ? "bg-white/20 text-white" : "bg-primary/10"}`}>{channel.protocolId ? protocols.find((protocol) => protocol.id === channel.protocolId)?.label || "自定义协议" : channel.apiFormat === "gemini" ? "Gemini" : "通用中转"}</span></span><span className="mt-1.5 block text-[11px] opacity-70">{channel.models.length} 个已选模型</span><span className="mt-1.5 flex items-center gap-1 text-[10px] opacity-75"><span className={`size-1.5 rounded-full ${ready ? "bg-current" : "border border-current"}`} />{ready ? "已配置" : "待配置"}</span></button>;
                                    })}</div>
                                </aside>
                                <div className="min-h-0 min-w-0 overflow-y-auto">{editingChannelId === "$defaults" ? <section className="rounded-3xl border border-border bg-background p-6 shadow-sm"><h2 className="text-lg font-semibold">全局默认模型</h2><p className="mt-1 mb-6 text-xs text-muted-foreground">选择画布与工作台初始使用的模型</p><div className="grid gap-5 sm:grid-cols-2">{modelGroups.map((group) => <div key={group.modelKey} className="rounded-2xl border border-border p-5"><div className="mb-3 text-sm font-medium">{t(group.labelKey)}</div><ModelPicker config={config} value={config[group.modelKey]} onChange={(model) => updateConfig(group.modelKey, model)} capability={group.capability} fullWidth /></div>)}</div></section> : <ChannelEditorDrawer key={editingChannel?.id} inline open={Boolean(editingChannel)} channel={editingChannel} onSave={saveChannel} onClose={() => setEditingChannelId("")} onDelete={() => editingChannel && deleteChannel(editingChannel.id)} />}</div>
                            </div>
                            </>
                        ),
                    },
                    {
                        key: "local-storage",
                        label: t("config.tabs.localStorage"),
                        children: <ConfigLocalStorage active={activeTab === "local-storage"} />,
                    },
                ].filter((item) => section === "all" || (section === "models" ? ["channels", "protocols"].includes(item.key) : item.key === "local-storage"))}
            />
            {showDoneButton ? (
                <div className="mt-4 flex justify-end">
                    <Button type="primary" onClick={finishConfig}>
                        {t("common.done")}
                    </Button>
                </div>
            ) : null}

        </>
    );
}

export function AppConfigModal() {
    const { t } = useTranslation();
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const configTab = useConfigStore((state) => state.configTab);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    return (
        <Modal
            title={
                <div>
                    <div className="text-lg font-semibold">{t("config.title")}</div>
                    <div className="mt-1 text-xs font-normal text-stone-500">{t("config.modalDescription")}</div>
                </div>
            }
            open={isConfigOpen}
            width={1180}
            centered
            onCancel={() => setConfigDialogOpen(false)}
            styles={{ body: { maxHeight: "72vh", overflowY: "auto", paddingRight: 12 } }}
            footer={null}
        >
            <AppConfigPanel showDoneButton initialTab={configTab} />
        </Modal>
    );
}

function withChannels(config: AiConfig, channels: ModelChannel[]): AiConfig {
    const next: AiConfig = {
        ...config,
        channels,
        models: modelOptionsFromChannels(channels),
        baseUrl: channels[0]?.baseUrl || "",
        apiKey: channels[0]?.apiKey || "",
        apiFormat: channels[0]?.apiFormat || config.apiFormat,
    };
    return {
        ...next,
        imageModel: pickDefaultModel(next, "image", config.imageModel),
        videoModel: pickDefaultModel(next, "video", config.videoModel),
        textModel: pickDefaultModel(next, "text", config.textModel),
        audioModel: pickDefaultModel(next, "audio", config.audioModel),
    };
}

function pickDefaultModel(config: AiConfig, capability: ModelCapability, current: string) {
    const options = selectableModelsByCapability(config, capability);
    const normalized = normalizeModelOptionValue(current, config.channels);
    return options.includes(normalized) ? normalized : options[0] || "";
}

