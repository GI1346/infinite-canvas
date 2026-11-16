export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        // 浅色调色板对齐即梦：中性浅灰画布（#f5f5f5）+ 白色卡片（文本卡片浅一档灰）。
        canvas: {
            background: "#f5f5f5",
            dot: "rgba(0,0,0,.16)",
            line: "rgba(0,0,0,.10)",
            selectionStroke: "#7ed3b4",
            selectionFill: "rgba(126,211,180,.12)",
        },
        node: {
            label: "#525252",
            fill: "#ffffff",
            panel: "#ffffff",
            stroke: "#e5e5e5",
            activeStroke: "#1a1a1a",
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
            surface: "rgba(255,255,255,.3)",
            sheen: "linear-gradient(180deg, rgba(255,255,255,.5), rgba(255,255,255,.12))",
            border: "rgba(255,255,255,.85)",
            highlight: "rgba(255,255,255,.9)",
            shadow: "0 18px 46px rgba(30,55,90,.13)",
            inset: "rgba(15,23,42,.045)",
            insetBorder: "rgba(15,23,42,.07)",
        },
    },
    dark: {
        // 深色调色板对齐即梦画布：纯黑底 + 低对比中性灰，点阵靠 10% 白点撑出层次。
        canvas: { background: "#0d0d0d", dot: "rgba(255,255,255,.07)", line: "rgba(255,255,255,.05)", selectionStroke: "#9fe6c9", selectionFill: "rgba(159,230,201,.14)" },
        node: { label: "#9a9a9a", fill: "#1a1a1a", panel: "#1d1d1d", stroke: "#3a3a3a", activeStroke: "#a3a3a3", placeholder: "#6f6f6f", text: "#e8e8e8", muted: "#9a9a9a", faint: "#6f6f6f" },
        toolbar: { panel: "rgba(24,24,24,.98)", border: "#2e2e2e", item: "#9a9a9a", itemHover: "#242424", shadow: "0 8px 28px rgba(0,0,0,.5)", activeBg: "#2f2f2f", activeText: "#f0f0f0" },
        accent: { base: "#37d39b", soft: "rgba(55,211,155,.16)" },
        glass: {
            surface: "rgba(14,14,14,.3)",
            sheen: "linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.035))",
            border: "rgba(255,255,255,.14)",
            highlight: "rgba(255,255,255,.16)",
            shadow: "0 20px 50px rgba(0,0,0,.55)",
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
        backdropFilter: "blur(18px) saturate(170%)",
        WebkitBackdropFilter: "blur(18px) saturate(170%)",
    };
}
