import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ReferenceImageCompressionSettings } from "@/lib/canvas/reference-image-compression";

export type AssistantCompressionOwner = "agent" | "harness";
type Settings = Required<ReferenceImageCompressionSettings>;
const defaults = (): Settings => ({ imageCompressionEnabled: false, imageCompressionResolution: "2k", imageCompressionMaxMb: 1 });
/** Preferences only; original image files and channel credentials are never stored here. */
export const useAssistantCompressionStore = create<{ agent: Settings; harness: Settings; update: (owner: AssistantCompressionOwner, patch: Partial<Settings>) => void }>()(
    persist((set) => ({ agent: defaults(), harness: defaults(), update: (owner, patch) => set((state) => ({ [owner]: { ...state[owner], ...patch } })) }), {
        name: "blinkflow_assistant_image_compression",
        partialize: ({ agent, harness }) => ({ agent, harness }),
    }),
);
