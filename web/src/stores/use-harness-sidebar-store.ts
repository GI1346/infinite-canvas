import { create } from "zustand";

type HarnessReferenceBatch = { id: string; projectId: string; files: Array<{ nodeId: string; name: string; dataUrl: string }> };

/** View state only. Official Harness keeps its own conversations and account session. */
export const useHarnessSidebarStore = create<{
    tab: "agent" | "harness";
    url: string;
    projectId: string;
    loading: boolean;
    error: string;
    references: HarnessReferenceBatch[];
}>(() => ({ tab: "agent", url: "", projectId: "", loading: false, error: "", references: [] }));
