import { useEffect, useRef } from "react";
import { Blend, BrainCircuit, Settings2, Table2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { getNodeSpec } from "@/constant/canvas";
import { CanvasNodeType, type ConnectionHandle, type Position } from "@/types/canvas";

export type PendingConnectionCreate = {
    connection: ConnectionHandle;
    position: Position;
};

export function ConnectionCreateMenu({
    pending,
    scale = 1,
    onCreate,
    onClose,
}: {
    pending: PendingConnectionCreate;
    scale?: number;
    onCreate: (type: string) => void;
    onClose: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    return (
        <div
            className="absolute z-[120] w-[300px] rounded-2xl border p-2 shadow-2xl backdrop-blur"
            data-canvas-no-zoom
            data-connection-create-menu
            style={{ left: pending.position.x, top: pending.position.y, transform: `scale(${1 / scale})`, transformOrigin: "top left", background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    {t("canvas.createMenu.fromNode")}
                </span>
                <button type="button" className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:bg-white/10 hover:opacity-100" onClick={onClose} aria-label={t("canvas.createMenu.close")}>
                    ×
                </button>
            </div>
            <div className="grid gap-0.5">
                <ConnectionCreateOption theme={theme} icon={<Settings2 className="size-4" />} title="生成配置" description="连接图文，保留配置并新增图片结果" onClick={() => onCreate(CanvasNodeType.Config)} />
                <ConnectionCreateOption theme={theme} icon={<Table2 className="size-4" />} title="多维表格" description="图片与文本按输入列逐行组合" onClick={() => onCreate("dxos:table")} />
                <ConnectionCreateOption theme={theme} icon={<BrainCircuit className="size-4" />} title="LLM 多模态分析" description="分析图片与文本，输出文本或表格" onClick={() => onCreate("dxos:llm")} />
                <ConnectionCreateOption theme={theme} icon={<Blend className="size-4" />} title="融合节点" description="将局部修改融合回原图" onClick={() => onCreate("blinkflow:fusion")} />
            </div>
        </div>
    );
}

export function ConnectionCreateOption({ theme, icon, title, description, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; icon: React.ReactNode; title: string; description?: string; onClick?: () => void }) {
    return (
        <button
            type="button"
            className="flex min-h-12 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition"
            style={{ color: theme.node.text, overflow: "hidden", whiteSpace: "normal" }}
            onClick={onClick}
            onMouseEnter={(event) => (event.currentTarget.style.background = theme.node.fill)}
            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
        >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: theme.node.fill, color: theme.node.muted }}>
                {icon}
            </span>
            <span className="min-w-0 flex-1" style={{ overflow: "hidden" }}>
                <span className="block text-sm font-medium leading-5" style={{ overflowWrap: "anywhere" }}>{title}</span>
                {description ? (
                    <span className="mt-0.5 block text-xs leading-4" style={{ color: theme.node.muted, whiteSpace: "normal", overflowWrap: "anywhere" }}>
                        {description}
                    </span>
                ) : null}
            </span>
        </button>
    );
}

export function NodeCreateMenu({ position, scale = 1, onCreate, onClose }: { position: Position; scale?: number; onCreate: (type: string) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    useNodeRegistryVersion();
    const menuRef = useRef<HTMLDivElement>(null);
    const order = [CanvasNodeType.Text, CanvasNodeType.Config, "dxos:table", "dxos:llm", "blinkflow:fusion"] as string[];
    const definitions = listNodeDefinitions().filter((def) => order.includes(def.type)).sort((a, b) => {
        const first = order.indexOf(a.type), second = order.indexOf(b.type);
        return (first < 0 ? order.length : first) - (second < 0 ? order.length : second);
    });
    // Close automatically when clicking outside the menu.
    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
        };
        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [onClose]);
    return (
        <div
            ref={menuRef}
            className="absolute z-[120] max-h-[70vh] w-[300px] overflow-y-auto rounded-2xl border p-2 shadow-2xl backdrop-blur thin-scrollbar"
            data-canvas-no-zoom
            style={{ left: position.x, top: position.y, transform: `scale(${1 / scale})`, transformOrigin: "top left", background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    {t("canvas.createMenu.select")}
                </span>
                <button type="button" className="grid size-7 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label={t("canvas.createMenu.close")}>
                    <X className="size-4" />
                </button>
            </div>
            <div className="grid gap-0.5">
                {definitions.map((def) => (
                    <ConnectionCreateOption key={def.type} theme={theme} icon={def.icon} title={getNodeSpec(def.type).title} description={def.description} onClick={() => onCreate(def.type)} />
                ))}
            </div>
        </div>
    );
}
