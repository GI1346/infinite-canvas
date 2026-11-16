import i18n from "@/i18n";
import { CANVAS_NODE_DEFAULT_SIZE, CONFIG_NODE_DEFAULT_SIZE, TEXT_NODE_DEFAULT_SIZE } from "@/lib/canvas/canvas-node-size";
import { CanvasNodeType } from "@/types/canvas";
import type { CanvasNodeMetadata } from "@/types/canvas";
import { getNodeSpec as getRegistryNodeSpec } from "@/lib/canvas/node-registry";

type CanvasNodeSpec = {
    width: number;
    height: number;
    title: string;
    metadata?: CanvasNodeMetadata;
};

// 画布内所有节点文字统一用这一档字号：标题、正文、空状态提示同一基准，靠字重和对比度区分层级。
export const CANVAS_NODE_FONT_SIZE = 24;

export const NODE_DEFAULT_SIZE = {
    [CanvasNodeType.Image]: { ...CANVAS_NODE_DEFAULT_SIZE, get title() { return i18n.t("canvas.nodeTypes.image"); } },
    [CanvasNodeType.Text]: { ...TEXT_NODE_DEFAULT_SIZE, get title() { return i18n.t("canvas.nodeTypes.text"); } },
    [CanvasNodeType.Config]: { ...CONFIG_NODE_DEFAULT_SIZE, get title() { return i18n.t("canvas.nodeTypes.config"); } },
    [CanvasNodeType.Video]: { ...CANVAS_NODE_DEFAULT_SIZE, get title() { return i18n.t("canvas.nodeTypes.video"); } },
    [CanvasNodeType.Audio]: { ...CANVAS_NODE_DEFAULT_SIZE, get title() { return i18n.t("canvas.nodeTypes.audio"); } },
    [CanvasNodeType.Group]: { ...CANVAS_NODE_DEFAULT_SIZE, get title() { return i18n.t("canvas.nodeTypes.group"); } },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

export const NODE_SPECS = {
    [CanvasNodeType.Image]: {
        ...CANVAS_NODE_DEFAULT_SIZE, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Image].title; },
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Text]: {
        ...TEXT_NODE_DEFAULT_SIZE, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Text].title; },
        metadata: { content: "", status: "idle", fontSize: CANVAS_NODE_FONT_SIZE },
    },
    [CanvasNodeType.Config]: {
        ...CONFIG_NODE_DEFAULT_SIZE, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Config].title; },
        metadata: { content: "", status: "idle", generationMode: "image" },
    },
    [CanvasNodeType.Video]: {
        ...CANVAS_NODE_DEFAULT_SIZE, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Video].title; },
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Audio]: {
        ...CANVAS_NODE_DEFAULT_SIZE, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Audio].title; },
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Group]: {
        ...CANVAS_NODE_DEFAULT_SIZE, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Group].title; },
        metadata: { status: "idle" },
    },
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

// Return built-in specs directly and resolve plugin types from the registry.
export function getNodeSpec(type: string) {
    if ((Object.values(CanvasNodeType) as string[]).includes(type)) return NODE_SPECS[type as CanvasNodeType];
    const spec = getRegistryNodeSpec(type);
    // 插件节点同样统一卡片尺寸，避免不同节点大小参差。
    return { width: CANVAS_NODE_DEFAULT_SIZE.width, height: CANVAS_NODE_DEFAULT_SIZE.height, title: spec.title, metadata: spec.metadata };
}
