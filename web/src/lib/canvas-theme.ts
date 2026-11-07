export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f5f8fc",
            dot: "rgba(71,85,105,.20)",
            line: "rgba(71,85,105,.09)",
            selectionStroke: "#2563eb",
            selectionFill: "rgba(37,99,235,.12)",
        },
        node: {
            label: "#475569",
            fill: "#edf2f8",
            panel: "#ffffff",
            stroke: "#d5deea",
            activeStroke: "#2563eb",
            placeholder: "#64748b",
            text: "#172033",
            muted: "#64748b",
            faint: "#8995a8",
        },
        toolbar: {
            panel: "rgba(255,255,255,.97)",
            border: "#d5deea",
            item: "#475569",
            itemHover: "#edf2f8",
            shadow: "0 8px 28px rgba(30,55,90,.10)",
            activeBg: "#e8efff",
            activeText: "#1d4ed8",
        },
    },
    dark: {
        canvas: { background: "#0c0f13", dot: "rgba(167,188,218,.18)", line: "rgba(167,188,218,.08)", selectionStroke: "#7aa7ff", selectionFill: "rgba(122,167,255,.18)" },
        node: { label: "#a4b3c7", fill: "#222830", panel: "#1b2026", stroke: "#344156", activeStroke: "#7aa7ff", placeholder: "#8494aa", text: "#e6edf7", muted: "#a4b3c7", faint: "#8494aa" },
        toolbar: { panel: "rgba(21,30,44,.98)", border: "#344156", item: "#a4b3c7", itemHover: "#202c3e", shadow: "0 8px 28px rgba(0,0,0,.26)", activeBg: "#243958", activeText: "#abcaff" },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
