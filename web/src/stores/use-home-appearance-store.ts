import localforage from "localforage";
import { create } from "zustand";

export type HomeGlassSettings = { blur: number; alpha: number };
export const homeGlassPresets = [
    { label: "原版厚磨砂", blur: 36, alpha: 72 },
    { label: "推荐通透", blur: 14, alpha: 44 },
    { label: "极清轻雾", blur: 8, alpha: 34 },
] as const;
export const defaultHomeGlass: HomeGlassSettings = { blur: 14, alpha: 44 };
export const homeGlassLimits = { blur: { min: 0, max: 44 }, alpha: { min: 18, max: 82 } };
export const homeWallpaperAccept = "image/jpeg,image/png,image/webp";
const wallpaperTypes = homeWallpaperAccept.split(",");
const glassKey = "blinkflow:home-glass-settings", wallpaperKey = "blinkflow:home-custom-wallpaper";
// A wallpaper is a Blob in IndexedDB; the driver may never fall back to localStorage.
const wallpaperStorage = localforage.createInstance({ name: "infinite-canvas", storeName: "app_state", driver: localforage.INDEXEDDB });

function clampSetting(key: keyof HomeGlassSettings, value: unknown) {
    const { min, max } = homeGlassLimits[key];
    return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : defaultHomeGlass[key];
}

function readGlassSettings(): HomeGlassSettings {
    try {
        const stored = JSON.parse(localStorage.getItem(glassKey) || "null");
        return { blur: clampSetting("blur", stored?.blur), alpha: clampSetting("alpha", stored?.alpha) };
    } catch { return defaultHomeGlass; }
}

type HomeAppearanceStore = {
    glass: HomeGlassSettings;
    wallpaperUrl: string | null;
    wallpaperReady: boolean;
    wallpaperBusy: boolean;
    setGlass: (patch: Partial<HomeGlassSettings>) => void;
    loadWallpaper: () => Promise<void>;
    setWallpaper: (file: File | null) => Promise<void>;
};

export const useHomeAppearanceStore = create<HomeAppearanceStore>((set, get) => ({
    glass: readGlassSettings(),
    wallpaperUrl: null,
    wallpaperReady: false,
    wallpaperBusy: false,
    setGlass: (patch) => {
        const next = { ...get().glass, ...patch };
        const glass = { blur: clampSetting("blur", next.blur), alpha: clampSetting("alpha", next.alpha) };
        try { localStorage.setItem(glassKey, JSON.stringify(glass)); }
        catch { /* The current session can still preview the material if storage is unavailable. */ }
        set({ glass });
    },
    loadWallpaper: async () => {
        if (get().wallpaperReady || get().wallpaperBusy) return;
        set({ wallpaperBusy: true });
        try {
            const stored = await wallpaperStorage.getItem<Blob>(wallpaperKey);
            if (stored instanceof Blob && wallpaperTypes.includes(stored.type)) set({ wallpaperUrl: URL.createObjectURL(stored) });
        } catch { /* The bundled wallpaper remains available. */ }
        finally { set({ wallpaperReady: true, wallpaperBusy: false }); }
    },
    setWallpaper: async (file) => {
        if (!get().wallpaperReady || get().wallpaperBusy) return;
        if (file && !wallpaperTypes.includes(file.type)) throw new Error("请选择 JPG、PNG 或 WebP 图片");
        const previous = get().wallpaperUrl;
        let url: string | null = null;
        set({ wallpaperBusy: true });
        try {
            if (file) {
                url = URL.createObjectURL(file);
                const preview = new Image();
                preview.src = url;
                try { await preview.decode(); }
                catch { throw new Error("无法读取这张图片，请换一张壁纸"); }
                await wallpaperStorage.setItem<Blob>(wallpaperKey, file);
            } else await wallpaperStorage.removeItem(wallpaperKey);
            set({ wallpaperUrl: url });
            if (previous) URL.revokeObjectURL(previous);
        } catch (error) {
            if (url) URL.revokeObjectURL(url);
            throw error;
        } finally { set({ wallpaperBusy: false }); }
    },
}));
