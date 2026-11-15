import { create } from "zustand";
import { persist } from "zustand/middleware";

import { inferMediaScale } from "@/lib/media-size";
import type { CanvasNodeMetadata } from "@/types/canvas";

/** 配置栏里可以记忆的项：新建图片 / 生成节点时沿用上一次的选择。 */
export type CanvasGenerationSettings = Pick<CanvasNodeMetadata, "model" | "size" | "quality" | "imageResolution" | "imageAspectRatio" | "count" | "imageCompressionEnabled" | "imageCompressionResolution" | "imageCompressionMaxMb">;

const SETTING_KEYS = ["model", "size", "quality", "imageResolution", "imageAspectRatio", "count", "imageCompressionEnabled", "imageCompressionResolution", "imageCompressionMaxMb"] as const;

type CanvasImageSettingsStore = {
    settings: CanvasGenerationSettings | null;
    remember: (patch: Partial<CanvasGenerationSettings>) => void;
};

export const useCanvasImageSettingsStore = create<CanvasImageSettingsStore>()(
    persist(
        (set) => ({
            settings: null,
            // 只收配置栏里的项；提示词、参考图等节点私有内容不进记忆。
            remember: (patch) => {
                const next: Partial<CanvasGenerationSettings> = {};
                for (const key of SETTING_KEYS) if (patch[key] !== undefined) (next as Record<string, unknown>)[key] = patch[key];
                if (!Object.keys(next).length) return;
                set((state) => {
                    const merged = { ...(state.settings || {}), ...next };
                    // 只换尺寸时按尺寸推断清晰度，避免留住上一次比例的清晰度。
                    if (next.size && !next.imageResolution && !next.imageAspectRatio) merged.imageResolution = inferMediaScale(next.size);
                    return { settings: merged };
                });
            },
        }),
        { name: "infinite-canvas:canvas_image_settings", partialize: (state) => ({ settings: state.settings }) },
    ),
);
