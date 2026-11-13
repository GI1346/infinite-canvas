import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Cpu } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { decodeChannelModel, modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
    groupByChannel?: boolean | "list";
    disabled?: boolean;
    ariaLabel?: string;
};

/** Match the canvas menu size at the 52% reference zoom. */
export function useCanvasMenuZoom(open: boolean) {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [zoom, setZoom] = useState(1);
    useEffect(() => {
        if (!open) return;
        let frame = 0;
        const update = () => {
            const trigger = triggerRef.current;
            if (trigger && trigger.offsetWidth) {
                // Menus portalled to body are not inside the zoomed canvas world;
                // only scale them for triggers that actually live in [data-canvas-world].
                // The config panel's content layer has its own constant zoom, which must
                // be removed so menus follow the canvas zoom only and stay at their
                // normal size instead of blowing up with the panel.
                const inCanvasWorld = Boolean(trigger.closest("[data-canvas-world]"));
                const panelContent = trigger.closest("[data-node-panel-content]");
                const contentZoom = panelContent ? Number(getComputedStyle(panelContent).zoom) || 1 : 1;
                const next = inCanvasWorld ? trigger.getBoundingClientRect().width / trigger.offsetWidth / contentZoom / 0.39 : 1;
                if (Number.isFinite(next) && next > 0) setZoom((current) => Math.abs(current - next) > 0.001 ? next : current);
            }
            frame = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, [open]);
    return { triggerRef, zoom };
}
export function ModelPicker({ config, value, onChange, capability, className, fullWidth = false, placeholder, onMissingConfig, groupByChannel = false, disabled = false, ariaLabel = "选择生成模型" }: ModelPickerProps) {
    const { t } = useTranslation();
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const { triggerRef, zoom: menuZoom } = useCanvasMenuZoom(open && groupByChannel === "list");
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const options = useMemo(() => Array.from(new Set([...(config.channelMode === "local" && !capability ? [value] : []), ...selectableModelsByCapability(config, capability)].filter((model): model is string => Boolean(model)))), [capability, config, value]);
    const current = value || "";
    const pickerPlaceholder = placeholder || t("settingsPanels.model.select");
    const changeOpen = (nextOpen: boolean) => {
        if (nextOpen && disabled) return;
        if (nextOpen && !options.length && config.channelMode === "local") onMissingConfig?.();
        if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
        setOpen(nextOpen);
    };

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    if (groupByChannel === "list") {
        const channels = config.channels.map((channel, index) => ({ ...channel, index, models: options.filter((id) => decodeChannelModel(id)?.channelId === channel.id) })).filter((channel) => channel.models.length);
        const selectedChannel = config.channels.findIndex((channel) => channel.id === decodeChannelModel(current)?.channelId);
        const surface = { background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke };
        return <DropdownMenu.Root open={open && !disabled} onOpenChange={changeOpen} modal={false}>
            <DropdownMenu.Trigger asChild><button ref={triggerRef} type="button" data-canvas-no-zoom aria-label={ariaLabel} disabled={disabled} className={cn("canvas-composer-model-picker flex h-12 min-w-0 max-w-full items-center gap-3 rounded-2xl border px-3 text-xl shadow-sm outline-none", fullWidth ? "w-full" : "w-fit min-w-[9rem]", className)} style={surface} title={current ? modelOptionLabel(config, current) : pickerPlaceholder} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>{selectedChannel >= 0 ? <ChannelBadge name={config.channels[selectedChannel].name} index={selectedChannel} /> : <ModelIcon model={current} />}<span className="min-w-0 flex-1 truncate text-left font-semibold">{current ? modelOptionName(current) : pickerPlaceholder}</span><ChevronDown size={18} className="shrink-0 opacity-60" /></button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content data-canvas-overlay data-canvas-no-zoom data-channel-model-menu className="z-[1200] w-80 max-w-[calc(100vw-24px)] max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto overscroll-contain rounded-xl border p-2 shadow-xl outline-none" style={{ ...surface, zoom: menuZoom }} align="start" sideOffset={8 * menuZoom} collisionPadding={12} updatePositionStrategy="always" onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
                {channels.map((channel) => <DropdownMenu.Group key={channel.id}>
                    <DropdownMenu.Label className="flex items-center gap-2 px-2 pb-1 pt-2 text-sm font-semibold" style={{ color: theme.node.muted }}><ChannelBadge name={channel.name} index={channel.index} /><span className="min-w-0 truncate">{channel.name}</span></DropdownMenu.Label>
                    {channel.models.map((model) => <DropdownMenu.Item key={model} data-model-id={model} data-selected={model === current} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold outline-none data-[highlighted]:ring-2 data-[highlighted]:ring-inset" title={modelOptionLabel(config, model)} textValue={modelOptionName(model)} style={model === current ? { background: theme.canvas.selectionStroke, color: theme.node.panel, outlineColor: theme.node.stroke } : { outlineColor: theme.node.stroke }} onSelect={() => onChange(model)}><ChannelBadge name={channel.name} index={channel.index} /><span className="min-w-0 flex-1 whitespace-normal break-all">{modelOptionName(model)}</span>{model === current && <Check size={20} className="shrink-0" />}</DropdownMenu.Item>)}
                </DropdownMenu.Group>)}
                {!channels.length && <DropdownMenu.Item disabled className="px-2 py-2 text-sm opacity-60">{emptyModelLabel(config, capability)}</DropdownMenu.Item>}
            </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>;
    }
    if (groupByChannel) {
        const channels = config.channels.map((channel) => ({ ...channel, models: options.filter((id) => decodeChannelModel(id)?.channelId === channel.id) })).filter((channel) => channel.models.length);
        const selectedChannel = decodeChannelModel(current)?.channelId;
        const surface = { background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke };
        const menuClass = "z-[1200] w-80 max-w-[calc(100vw-24px)] max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto rounded-xl border p-1 shadow-xl outline-none";
        const itemClass = "flex min-w-0 cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-black/5 dark:data-[highlighted]:bg-white/10";
        return <DropdownMenu.Root open={open && !disabled} onOpenChange={changeOpen} modal={false}>
            <DropdownMenu.Trigger asChild><button type="button" data-canvas-no-zoom aria-label={ariaLabel} disabled={disabled} className={cn("canvas-composer-model-picker flex h-8 min-w-0 max-w-full items-center gap-2 rounded-full border border-input bg-transparent px-3 text-sm shadow-sm", fullWidth ? "w-full" : "w-fit min-w-[9rem]", className)} title={current ? modelOptionLabel(config, current) : pickerPlaceholder} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}><ModelIcon model={current} /><span className="min-w-0 flex-1 truncate text-left">{current ? modelOptionName(current) : pickerPlaceholder}</span><ChevronDown size={14} className="shrink-0" /></button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content data-canvas-overlay data-canvas-no-zoom data-channel-model-menu className={menuClass} style={surface} align="start" sideOffset={6} collisionPadding={12} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
                <DropdownMenu.Label className="px-3 py-1 text-xs opacity-60">选择中转站</DropdownMenu.Label>
                {channels.map((channel) => <DropdownMenu.Sub key={channel.id}>
                    <DropdownMenu.SubTrigger data-model-channel={channel.id} className={itemClass} style={selectedChannel === channel.id ? { background: theme.toolbar.activeBg, color: theme.node.text } : undefined} title={channel.name}><span className="min-w-0 flex-1 whitespace-normal break-all">{channel.name}</span>{selectedChannel === channel.id && <Check size={15} className="shrink-0" />}<ChevronRight size={15} className="shrink-0" /></DropdownMenu.SubTrigger>
                    <DropdownMenu.Portal><DropdownMenu.SubContent data-canvas-overlay data-canvas-no-zoom data-channel-model-options={channel.id} className={cn(menuClass, "w-[26rem]")} style={surface} sideOffset={6} collisionPadding={12} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
                        <DropdownMenu.Label className="break-all px-3 py-1 text-xs opacity-60">{channel.name}</DropdownMenu.Label>
                        {channel.models.map((model) => <DropdownMenu.Item key={model} data-model-id={model} data-selected={model === current} className={itemClass} title={modelOptionLabel(config, model)} textValue={modelOptionName(model)} style={model === current ? { background: theme.toolbar.activeBg, color: theme.node.text } : undefined} onSelect={() => onChange(model)}><ModelIcon model={model} /><span className="min-w-0 flex-1 whitespace-normal break-all">{modelOptionName(model)}</span>{model === current && <Check size={15} className="shrink-0" />}</DropdownMenu.Item>)}
                    </DropdownMenu.SubContent></DropdownMenu.Portal>
                </DropdownMenu.Sub>)}
                {!channels.length && <DropdownMenu.Item disabled className={itemClass}>{emptyModelLabel(config, capability)}</DropdownMenu.Item>}
            </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>;
    }
    return (
        <Select
            disabled={disabled}
            open={open && !disabled}
            value={current}
            onOpenChange={changeOpen}
            onValueChange={onChange}
        >
            <SelectTrigger
                className={cn(
                    "canvas-composer-model-picker h-8 w-fit max-w-full gap-2 rounded-full border border-input bg-transparent px-3 text-sm font-normal shadow-sm transition-colors",
                    fullWidth ? "w-full min-w-0 justify-start" : "min-w-[9rem] justify-start",
                    "data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20",
                    className,
                )}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title={current ? modelOptionLabel(config, current) : pickerPlaceholder}
            >
                <ModelIcon model={current} />
                <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{current ? modelOptionLabel(config, current) : pickerPlaceholder}</span>
            </SelectTrigger>
            <SelectContent
                data-canvas-overlay
                data-canvas-no-zoom
                className="z-[1200] w-80 max-w-[calc(100vw-24px)] rounded-xl border border-border/70 bg-popover p-1 shadow-xl"
                position="popper"
                align="start"
                side="bottom"
                sideOffset={6}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {options.length ? (
                    options.map((model) => (
                        <SelectItem key={model} value={model} textValue={modelOptionLabel(config, model)}>
                            <ModelLabel config={config} model={model} />
                        </SelectItem>
                    ))
                ) : (
                    <SelectItem value="__empty__" disabled>
                        {emptyModelLabel(config, capability)}
                    </SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}

function emptyModelLabel(config: AiConfig, capability?: ModelCapability) {
    const label = capability ? i18n.t(`settingsPanels.model.capabilities.${capability}`) : "";
    if (capability && config.models.length) return i18n.t("settingsPanels.model.assign", { capability: label });
    return config.models.length ? i18n.t("settingsPanels.model.noMatch", { capability: label }) : i18n.t("settingsPanels.model.addFirst");
}

function ModelLabel({ config, model }: { config: AiConfig; model: string }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <ModelIcon model={model} />
            <span className="truncate">{modelOptionLabel(config, model)}</span>
        </span>
    );
}

function ModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(modelOptionName(model));
    return icon ? <img src={icon} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function ChannelBadge({ name, index }: { name: string; index: number }) {
    return <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: `hsl(${(index * 137.508 + 228) % 360} 78% 58%)` }}>{Array.from(name.trim())[0]?.toLocaleUpperCase() || "?"}</span>;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok") || name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek") || name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm") || name.includes("glm")) return "/icons/glm.svg";
    return "";
}
