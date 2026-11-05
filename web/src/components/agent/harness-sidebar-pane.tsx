import { AssistantImageCompression } from "@/components/agent/assistant-image-compression";
import { useEffect, useRef, useState } from "react";
import { harnessModelsState, harnessSelectionState, openDeepSeekHarness, resolveHarnessReference } from "@/services/api/deepseek-harness";
import { canvasThemes } from "@/lib/canvas-theme";
import { useCanvasAssistantStore } from "@/stores/use-canvas-assistant-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useHarnessModelStore } from "@/stores/use-harness-model-store";
import { useHarnessSidebarStore } from "@/stores/use-harness-sidebar-store";
import { useThemeStore } from "@/stores/use-theme-store";

const channel = "blinkflow-harness-sidebar";
const canvasTheme = () => {
    const state = useThemeStore.getState(), theme = canvasThemes[state.theme];
    return { mode: state.theme, background: state.canvasBackgrounds[state.theme] || theme.canvas.background, panel: theme.node.panel, fill: theme.node.fill, text: theme.node.text, muted: theme.node.muted, border: theme.node.stroke, active: theme.toolbar.activeBg };
};

/** Keep the actual Harness app mounted while switching assistants. No channel secrets cross this frame bridge. */
export function HarnessSidebarPane() {
    const sidebar = useHarnessSidebarStore(), frame = useRef<HTMLIFrameElement>(null);
    const [loginUrl, setLoginUrl] = useState("");
    const currentProject = useCanvasAssistantStore((state) => state.context?.snapshot.projectId);
    const matching = sidebar.projectId === currentProject;
    const frameUrl = sidebar.url ? (() => { const url = new URL(sidebar.url); url.hash = new URLSearchParams({ blinkflowHost: location.origin }).toString(); return url.href; })() : "";
    const send = (kind: string, value?: unknown) => {
        if (!sidebar.url) return;
        frame.current?.contentWindow?.postMessage({ channel, kind, value }, new URL(sidebar.url).origin);
    };
    const connect = () => send("connect", { theme: canvasTheme() });
    useEffect(() => {
        if (!sidebar.url) return;
        const origin = new URL(sidebar.url).origin, controllers = new Set<AbortController>();
        const post = (kind: string, value?: unknown) => frame.current?.contentWindow?.postMessage({ channel, kind, value }, origin);
        const receive = (event: MessageEvent) => {
            if (event.source !== frame.current?.contentWindow || event.origin !== origin || event.data?.channel !== channel) return;
            if (event.data.kind === "ready") { post("connect", { theme: canvasTheme() }); return; }
            if (event.data.kind !== "request" || typeof event.data.id !== "string") return;
            const { id, method, args } = event.data;
            void (async () => {
                const controller = new AbortController(); controllers.add(controller);
                try {
                    const context = useCanvasAssistantStore.getState().context;
                    if (!context || context.getSnapshot().projectId !== sidebar.projectId) throw new Error("画布已切换，请从当前画布重新打开 Harness");
                    let result: unknown;
                    switch (method) {
                        case "models.get": result = harnessModelsState(); break;
                        case "models.select": {
                            if (typeof args?.imageModel !== "string") throw new Error("无效的图片模型");
                            const models = harnessModelsState();
                            if (args.imageModel && !models.channels.some((item) => item.models.some((model) => model.id === args.imageModel))) throw new Error("所选生图模型已失效，请重新选择");
                            useHarnessModelStore.getState().setImageModel(args.imageModel); result = harnessModelsState(); break;
                        }
                        case "references.selection": result = harnessSelectionState(); break;
                        case "references.get": result = useHarnessSidebarStore.getState().references.filter((batch) => batch.projectId === sidebar.projectId); break;
                        case "references.ack": useHarnessSidebarStore.setState((state) => ({ references: state.references.filter((batch) => batch.id !== args?.id || batch.projectId !== sidebar.projectId) })); result = true; break;
                        case "references.resolve":
                            if (args?.projectId !== sidebar.projectId || typeof args.nodeId !== "string") throw new Error("引用节点与当前画布不匹配");
                            result = await resolveHarnessReference({ id, projectId: sidebar.projectId, tool: "resolve_reference", args: { nodeId: args.nodeId } }, controller.signal); break;
                        default: throw new Error("未知的 Harness 侧栏操作");
                    }
                    if (!controller.signal.aborted) post("response", { id, result });
                } catch (error) { if (!controller.signal.aborted) post("response", { id, error: error instanceof Error ? error.message : String(error) }); }
                finally { controllers.delete(controller); }
            })();
        };
        window.addEventListener("message", receive);
        const themeChanged = useThemeStore.subscribe(() => post("theme", canvasTheme()));
        const modelsChanged = () => post("models", harnessModelsState());
        const offConfig = useConfigStore.subscribe(modelsChanged), offModel = useHarnessModelStore.subscribe(modelsChanged);
        const offReferences = useHarnessSidebarStore.subscribe((state, previous) => { if (state.references !== previous.references) post("references"); });
        const offSelection = useCanvasAssistantStore.subscribe((state, previous) => {
            post("selection");
            if (state.context?.getSnapshot().projectId !== previous.context?.getSnapshot().projectId) controllers.forEach((controller) => controller.abort());
        });
        return () => { window.removeEventListener("message", receive); themeChanged(); offConfig(); offModel(); offReferences(); offSelection(); controllers.forEach((controller) => controller.abort()); };
    }, [sidebar.url, sidebar.projectId]);
    useEffect(() => {
        const login = (event: Event) => {
            try { const url = new URL((event as CustomEvent<string>).detail); if (url.protocol === "https:" && (["deepseek.com", "github.com", "deepseek-harness.github.io"].includes(url.hostname) || url.hostname.endsWith(".deepseek.com"))) setLoginUrl(url.href); } catch { /* Ignore malformed external URLs. */ }
        };
        window.addEventListener("blinkflow-harness-login", login);
        return () => window.removeEventListener("blinkflow-harness-login", login);
    }, []);
    return <div data-harness-sidebar className="relative min-h-0 flex-1 flex-col" style={{ display: sidebar.tab === "harness" ? "flex" : "none" }}>
        <div className="shrink-0 p-2"><AssistantImageCompression owner="harness" /></div>
        {loginUrl && <p className="shrink-0 px-3 py-2 text-xs"><a href={loginUrl} target="_blank" rel="noreferrer" className="underline">打开 DeepSeek 官方登录页面</a><button className="ml-3" onClick={() => setLoginUrl("")}>关闭</button></p>}
        {sidebar.url && <iframe ref={frame} title="DeepSeek Harness" src={frameUrl} onLoad={connect} className="h-full min-h-0 w-full flex-1 border-0" style={{ visibility: matching ? "visible" : "hidden" }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads" allow="clipboard-read; clipboard-write" />}
        {(sidebar.loading || sidebar.error || !sidebar.url || !matching) && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center text-sm" style={{ background: canvasTheme().panel }}>
            <p>{sidebar.loading ? "正在打开 DeepSeek Harness…" : sidebar.error || "打开当前画布的 DeepSeek Harness"}</p>
            {!sidebar.loading && <button type="button" className="rounded border px-3 py-2" onClick={() => void openDeepSeekHarness().catch(() => {})}>打开 Harness</button>}
        </div>}
    </div>;
}
