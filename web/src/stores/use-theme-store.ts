import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "light" | "dark";

type ThemeStore = {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
    canvasBackgrounds: Partial<Record<ThemeName, string>>;
    setCanvasBackground: (color: string) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "light",
            canvasBackgrounds: {},
            setCanvasBackground: (color) => set((state) => ({ canvasBackgrounds: { ...state.canvasBackgrounds, [state.theme]: color } })),
            setTheme: (theme) => set({ theme }),
        }),
        { name: "infinite-canvas:theme_store" },
    ),
);
