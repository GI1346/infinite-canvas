import { create } from "zustand";

export const CANVAS_SIDE_PANEL_MOTION_MS = 220;
export const CANVAS_SIDE_PANEL_MIN_WIDTH = 320;
export const CANVAS_SIDE_PANEL_MAX_WIDTH = 480;
export const CANVAS_SIDE_PANEL_DEFAULT_WIDTH = 360;

const WIDTH_KEY = "canvas-side-panel-width";
export type CanvasSidePanelTab = "history" | "resources" | "gallery";
let closeTimer: ReturnType<typeof setTimeout> | undefined;

function initialWidth() {
    if (typeof window === "undefined") return CANVAS_SIDE_PANEL_DEFAULT_WIDTH;
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    if (!stored) return CANVAS_SIDE_PANEL_DEFAULT_WIDTH;
    return Math.min(CANVAS_SIDE_PANEL_MAX_WIDTH, Math.max(CANVAS_SIDE_PANEL_MIN_WIDTH, stored));
}

type CanvasSidePanelStore = {
    tab: CanvasSidePanelTab;
    openTab: (tab: CanvasSidePanelTab) => void;
    width: number;
    panelOpen: boolean;
    panelMounted: boolean;
    panelClosing: boolean;
    setWidth: (width: number) => void;
    openPanel: () => void;
    closePanel: () => void;
};

export const useCanvasSidePanelStore = create<CanvasSidePanelStore>((set, get) => ({
    tab: "history",
    openTab: (tab) => {
        if (get().panelOpen && get().tab === tab) { get().closePanel(); return; }
        set({ tab }); get().openPanel();
    },
    width: initialWidth(),
    panelOpen: false,
    panelMounted: false,
    panelClosing: false,
    setWidth: (width) => set({ width }),
    openPanel: () => {
        clearTimeout(closeTimer);
        set({ panelOpen: true, panelMounted: true, panelClosing: false });
    },
    closePanel: () => {
        if (!get().panelMounted || get().panelClosing) return;
        set({ panelOpen: false, panelClosing: true });
        closeTimer = setTimeout(() => set({ panelMounted: false, panelClosing: false }), CANVAS_SIDE_PANEL_MOTION_MS);
    },
}));