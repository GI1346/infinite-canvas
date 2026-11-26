import { useEffect, useRef } from "react";
import { Blend, BrainCircuit, Image as ImageIcon, Settings2, Table2, FileText, Video, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { getNodeDefinition, listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { getNodeSpec } from "@/constant/canvas";
import { CanvasNodeType, CHARACTER_RECIPE_NODE_TYPE, type ConnectionHandle, type Position } from "@/types/canvas";

export type PendingConnectionCreate = {
    connection: ConnectionHandle;
    position: Position;
};

export function ConnectionCreateMenu({
    pending,
    scale = 1,
    onCreate,
    onClose,
    showCharacterRecipe,
}: {
    pending: PendingConnectionCreate;
    scale?: number;
    onCreate: (type: string) => void;
    onClose: () => void;
    showCharacterRecipe?: boolean;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    const batch = Boolean(pending.connection.batchPointer);
    const recipe = showCharacterRecipe && !batch ? getNodeDefinition(CHARACTER_RECIPE_NODE_TYPE) : undefined;
    return (
        <div
            className={`bf-canvas-glass absolute z-[120] w-[300px] rounded-2xl border p-2.5 shadow-2xl backdrop-blur ${batch ? "bf-spring-pop max-h-[calc(100dvh-16px)] overflow-auto" : ""}`}
            data-canvas-no-zoom
            data-connection-create-menu
            data-canvas-overlay
            data-canvas-shortcuts-ignore
            style={{ left: pending.position.x, top: pending.position.y, transform: `scale(${1 / scale})${pending.connection.handleType === "target" ? " translateX(-100%)" : ""}`, transformOrigin: "top left", background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}
        >
            <div className="mb-1.5 flex items-center justify-between border-b border-black/[0.06] px-1 pb-2 dark:border-white/[0.08]">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    {t("canvas.createMenu.fromNode")}
                </span>
                <button type="button" className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:bg-white/10 hover:opacity-100" onClick={onClose} aria-label={t("canvas.createMenu.close")}>
                    ×
                </button>
            </div>
            <div className="grid gap-0.5">
                <ConnectionCreateOption theme={theme} icon={<ImageIcon className="size-4" />} title={batch ? "图片生成" : "生成节点"} description="连上提示词/参考图，生成结果直接落在这个节点" onClick={() => onCreate(CanvasNodeType.Image)} />
                {batch ? <ConnectionCreateOption theme={theme} icon={<Video className="size-4" />} title="视频生成" description="用提示词和参考素材生成视频" onClick={() => onCreate(CanvasNodeType.Video)} /> : <ConnectionCreateOption theme={theme} icon={<FileText className="size-4" />} title="文本" description="输入和编辑文字" onClick={() => onCreate(CanvasNodeType.Text)} />}
                <ConnectionCreateOption theme={theme} icon={<Table2 className="size-4" />} title="多维表格" description="图片与文本按输入列逐行组合" onClick={() => onCreate("dxos:table")} />
                <ConnectionCreateOption theme={theme} icon={<BrainCircuit className="size-4" />} title="LLM 多模态分析" description="分析图片与文本，输出文本或表格" onClick={() => onCreate("dxos:llm")} />
                {!batch && <ConnectionCreateOption theme={theme} icon={<Blend className="size-4" />} title="融合节点" description="将局部修改融合回原图" onClick={() => onCreate("blinkflow:fusion")} />}
                {recipe && <ConnectionCreateOption theme={theme} icon={recipe.icon} title={recipe.title} description={recipe.description} onClick={() => onCreate(recipe.type)} />}
            </div>
        </div>
    );
}

export function ConnectionCreateOption({ theme, icon, title, description, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; icon: React.ReactNode; title: string; description?: string; onClick?: () => void }) {
    return (
        <button type="button" className="group flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left transition hover:bg-[#0ea977]/[0.08] dark:hover:bg-[#37d39b]/[0.12]" style={{ color: theme.node.text }} onClick={onClick}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] transition group-hover:bg-[#0ea977] group-hover:text-white dark:bg-white/[0.06] dark:group-hover:bg-[#37d39b] dark:group-hover:text-[#0a0c0f]">{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold leading-5">{title}</span>
                {description ? (
                    <span className="mt-0.5 block truncate text-[11px] leading-4" style={{ color: theme.node.muted }}>
                        {description}
                    </span>
                ) : null}
            </span>
        </button>
    );
}

/** 创建菜单里每个节点的一句话说明；补齐没有 description 的内置节点。 */
const CREATEMENU_DESCRIPTIONS: Record<string, string> = {
    [CanvasNodeType.Image]: "输入文字与参考图，生成结果就在节点里",
    [CanvasNodeType.Text]: "输入和编辑文字，可直接生图",
    "dxos:table": "图片与文本按输入列逐行组合",
    "dxos:llm": "分析图片与文本，输出文本或表格",
    "blinkflow:fusion": "将局部修改融合回原图",
};

export function NodeCreateMenu({ position, scale = 1, onCreate, onClose }: { position: Position; scale?: number; onCreate: (type: string) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    useNodeRegistryVersion();
    const menuRef = useRef<HTMLDivElement>(null);
    const order = [CanvasNodeType.Image, CanvasNodeType.Text, "dxos:table", "dxos:llm", "blinkflow:fusion", CHARACTER_RECIPE_NODE_TYPE] as string[];
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
        // 外层只负责锚定画布坐标；内层用 zoom 抵消画布缩放，菜单尺寸与文字始终是屏幕像素，
        // 又不像 transform 反向缩放那样把布局压到极窄，低缩放时条目不会重叠。
        <div className="absolute z-[120]" style={{ left: position.x, top: position.y }}>
            <div
                ref={menuRef}
                className="bf-canvas-glass thin-scrollbar w-[300px] overflow-y-auto rounded-2xl border p-2.5 shadow-2xl backdrop-blur"
                data-canvas-no-zoom
                style={{ zoom: 1 / Math.max(scale, 0.01), maxHeight: "70vh", background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <div className="mb-1.5 flex items-center justify-between border-b border-black/[0.06] px-1 pb-2 dark:border-white/[0.08]">
                    <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                        {t("canvas.createMenu.select")}
                    </span>
                    <button type="button" className="grid size-7 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label={t("canvas.createMenu.close")}>
                        <X className="size-4" />
                    </button>
                </div>
                <div className="grid gap-0.5">
                    {definitions.map((def) => (
                        <ConnectionCreateOption key={def.type} theme={theme} icon={def.icon} title={def.type === CanvasNodeType.Image ? "生成节点" : getNodeSpec(def.type).title} description={CREATEMENU_DESCRIPTIONS[def.type] ?? def.description} onClick={() => onCreate(def.type)} />
                    ))}
                </div>
            </div>
        </div>
    );
}
