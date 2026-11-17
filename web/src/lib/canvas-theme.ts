export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

/** 画布内五级 Z-Index（L0~L4），仅在 .bf-canvas-workspace 内部约定，避免与全局层级混用。 */
export const CANVAS_Z_INDEX = {
    world: 10,          // L0: 画布节点与 SVG 连线层
    nodeContextual: 20, // L1: 节点选中悬停工具栏与框选工具条
    dockedPanels: 30,   // L2: 顶部三段栏、左侧分组工具栏、可调宽侧边抽屉、右下角缩放与小地图
    floatingAgent: 40,  // L3: 悬浮 Agent 对话窗口与右键菜单
    modalDialog: 50,    // L4: 裁剪、涂鸦重绘、选区提取、宫格切图等全屏弹窗
} as const;

export const canvasThemes = {
    light: {
        // 浅色调色板对齐即梦：中性浅灰画布（#f5f5f5）+ 白色卡片（文本卡片浅一档灰）。
        canvas: {
            background: "#f5f5f5",
            dot: "rgba(0,0,0,.16)",
            line: "rgba(0,0,0,.10)",
            selectionStroke: "#0ea977",
            selectionFill: "rgba(14, 169, 119, 0.10)",
        },
        node: {
            label: "#525252",
            fill: "#ffffff",
            panel: "#ffffff",
            stroke: "#e5e5e5",
            activeStroke: "#0ea977",
            placeholder: "#a3a3a3",
            text: "#1a1a1a",
            muted: "#737373",
            faint: "#a3a3a3",
        },
        toolbar: {
            panel: "rgba(255,255,255,.97)",
            border: "#e5e5e5",
            item: "#525252",
            itemHover: "#f0f0f0",
            shadow: "0 8px 28px rgba(0,0,0,.08)",
            activeBg: "#eef7f3",
            activeText: "#12896a",
        },
        // 磨砂玻璃：半透明底 + 一层白色渐变提亮，让玻璃比背景更亮一档，靠细描边撑出边缘。
        // 绿色强调色：激活态、节点类型图标、Agent 发送键等小细节。
        accent: { base: "#0ea977", soft: "rgba(14,169,119,.14)" },
        glass: {
            surface: "rgba(255, 255, 255, 0.56)",
            sheen: "linear-gradient(180deg, rgba(255,255,255,.5), rgba(255,255,255,.12))",
            border: "rgba(229, 231, 235, 0.92)",
            highlight: "rgba(255,255,255,.9)",
            shadow: "0 14px 36px -6px rgba(15, 23, 42, 0.09), 0 2px 8px -2px rgba(15, 23, 42, 0.04)",
            inset: "rgba(15,23,42,.045)",
            insetBorder: "rgba(15,23,42,.07)",
        },
    },
    dark: {
        // 深色调色板对齐即梦画布：纯黑底 + 低对比中性灰，点阵靠 10% 白点撑出层次。
        canvas: { background: "#0d0d0d", dot: "rgba(255,255,255,.07)", line: "rgba(255,255,255,.05)", selectionStroke: "#37d39b", selectionFill: "rgba(55, 211, 155, 0.10)" },
        node: { label: "#9a9a9a", fill: "#17191e", panel: "#1d1d1d", stroke: "#2c3038", activeStroke: "#37d39b", placeholder: "#6f6f6f", text: "#e8e8e8", muted: "#9a9a9a", faint: "#6f6f6f" },
        toolbar: { panel: "rgba(24,24,24,.98)", border: "#2e2e2e", item: "#9a9a9a", itemHover: "#242424", shadow: "0 8px 28px rgba(0,0,0,.5)", activeBg: "#2f2f2f", activeText: "#f0f0f0" },
        accent: { base: "#37d39b", soft: "rgba(55,211,155,.16)" },
        glass: {
            surface: "rgba(18, 20, 26, 0.48)",
            sheen: "linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.035))",
            border: "rgba(255, 255, 255, 0.14)",
            highlight: "rgba(255,255,255,.16)",
            shadow: "0 20px 48px -8px rgba(0, 0, 0, 0.65), 0 2px 10px -2px rgba(0, 0, 0, 0.45)",
            inset: "rgba(255,255,255,.055)",
            insetBorder: "rgba(255,255,255,.09)",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];

/** 工具栏 / 侧栏统一用磨砂玻璃：半透明底色 + 白色提亮 + 背景模糊 + 顶部内高光 + 细描边。 */
export function canvasGlass(theme: CanvasTheme) {
    return {
        backgroundColor: theme.glass.surface,
        backgroundImage: theme.glass.sheen,
        borderColor: theme.glass.border,
        boxShadow: `${theme.glass.shadow}, inset 0 1px 0 ${theme.glass.highlight}`,
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
    };
}
