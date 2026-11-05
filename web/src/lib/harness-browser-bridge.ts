import type { HarnessCanvasRequest } from "@/services/api/deepseek-harness";

/** Electron keeps its native bridge; a local Vite preview uses the bundled runtime. */
export function ensureHarnessBridge() {
    if (window.blinkflowHarness) return window.blinkflowHarness;
    const token = document.querySelector<HTMLMetaElement>('meta[name="blinkflow-harness-preview"]')?.content;
    if (!token) return;
    const clientId = crypto.randomUUID();
    const post = async (path: string, value: unknown) => {
        let response: Response;
        try {
            response = await fetch("/__blinkflow_harness/" + path, { method: "POST", headers: { "Content-Type": "application/json", "X-Blinkflow-Preview": token, "X-Blinkflow-Client": clientId }, body: JSON.stringify(value) });
        } catch {
            throw new Error("本地画布预览服务未连接，请恢复预览服务后刷新画布，再打开 Harness");
        }
        if (response.status === 403) throw new Error("本地预览连接已失效，请刷新画布后重新打开 Harness");
        if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Harness 本地连接返回了无效响应，请刷新画布后重新打开");
        const result = await response.json();
        if (!response.ok || result?.error) throw new Error(result?.error || "Harness 本地连接失败");
        return result;
    };
    const toolHandlers = new Set<(request: HarnessCanvasRequest) => void>(), cancelHandlers = new Set<(id: string) => void>();
    let events: EventSource | undefined;
    const connect = () => {
        if (events) return;
        events = new EventSource("/__blinkflow_harness/events?token=" + encodeURIComponent(token) + "&client=" + clientId);
        events.addEventListener("tool", (event) => { const request = JSON.parse((event as MessageEvent).data); toolHandlers.forEach((handler) => handler(request)); });
        events.addEventListener("cancel", (event) => { const id = JSON.parse((event as MessageEvent).data); cancelHandlers.forEach((handler) => handler(id)); });
        events.addEventListener("external", (event) => window.dispatchEvent(new CustomEvent("blinkflow-harness-login", { detail: JSON.parse((event as MessageEvent).data) })));
    };
    window.blinkflowHarness = {
        open: async (options) => { connect(); return post("open", options); },
        addReferences: async () => { throw new Error("请使用当前画布的 Harness 附件入口"); },
        publishSelection: () => {},
        publishModels: (state) => { void post("models", state).catch(() => {}); },
        onImageModel: () => () => {},
        onTool: (handler) => { toolHandlers.add(handler); connect(); return () => toolHandlers.delete(handler); },
        onCancel: (handler) => { cancelHandlers.add(handler); return () => cancelHandlers.delete(handler); },
        respond: (id, result) => { void post("response", { id, result }).catch(() => {}); },
    };
    return window.blinkflowHarness;
}
