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
const paneAction = "inline-flex shrink-0 items-center justify-center rounded-md border px-2 py-1 text-[11px] transition hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10";
const canvasTheme = () => {
    const state = useThemeStore.getState(), theme = canvasThemes[state.theme];
    return { mode: state.theme, background: state.canvasBackgrounds[state.theme] || theme.canvas.background, panel: theme.node.panel, fill: theme.node.fill, text: theme.node.text, muted: theme.node.muted, border: theme.node.stroke, active: theme.toolbar.activeBg };
};

/** Keep the actual Harness app mounted while switching assistants. No channel secrets cross this frame bridge. */
export function HarnessSidebarPane() {
    const sidebar = useHarnessSidebarStore(), frame = useRef<HTMLIFrameElement>(null);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [loginUrl, setLoginUrl] = useState("");
    const [manualUrl, setManualUrl] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const [urlError, setUrlError] = useState("");
    const currentProject = useCanvasAssistantStore((state) => state.context?.snapshot.projectId);
    const matching = sidebar.projectId === currentProject;
    // dsh web 的鉴权靠 URL 上的 ?token= 换 Cookie（HttpOnly; SameSite=Strict）。
    // 开发预览页在 localhost、Harness 监听 127.0.0.1 时属于跨站，Strict Cookie 会被浏览器丢掉，
    // 于是页面只剩「dsh web authentication required」。这里把 iframe 主机名对齐父页面，
    // 再把 blinkflowHost 合并进 hash（保留已有 hash 参数），token/query 一律不动。
    const frameUrl = sidebar.url ? (() => {
        const url = new URL(sidebar.url);
        if (["localhost", "127.0.0.1"].includes(location.hostname)) url.hostname = location.hostname;
        const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
        hash.set("blinkflowHost", location.origin);
        url.hash = hash.toString();
        return url.href;
    })() : "";
    const hasToken = Boolean(sidebar.url && new URL(sidebar.url).searchParams.has("token"));
    // 手动粘贴 dsh web 打印的地址重连：只接受本机 http 地址，避免把任何外部链接塞进 iframe。
    const reconnect = (raw: string) => {
        const text = raw.trim();
        if (!text) return;
        let parsed: URL;
        try { parsed = new URL(text); } catch { setUrlError("地址格式不正确"); return; }
        if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)) { setUrlError("只支持 dsh web 打印的本机 http 地址"); return; }
        setUrlError("");
        useHarnessSidebarStore.setState({ url: parsed.href, projectId: currentProject || "", loading: false, error: "" });
        setReloadKey((value) => value + 1);
    };
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
        {sidebar.url && <iframe key={reloadKey} ref={frame} title="DeepSeek Harness" src={frameUrl} onLoad={connect} className="h-full min-h-0 w-full flex-1 border-0" style={{ visibility: matching ? "visible" : "hidden" }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads" allow="clipboard-read; clipboard-write" />}
        {(sidebar.loading || sidebar.error || !sidebar.url || !matching) && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center text-sm" style={{ background: "transparent" }}>
            <p>{sidebar.loading ? "正在打开 DeepSeek Harness…" : sidebar.error || "打开当前画布的 DeepSeek Harness"}</p>
            {!sidebar.loading && <button type="button" className="rounded border px-3 py-2" onClick={() => void openDeepSeekHarness().catch(() => {})}>打开 Harness</button>}
        </div>}
        {/* 鉴权兜底：dsh web 的 token 换 Cookie 在部分环境会被拦，这里支持粘贴启动时打印的地址重连，或直接在系统浏览器打开。 */}
        <div className="shrink-0 border-t px-2 py-1.5" style={{ borderColor: theme.node.stroke }}>
            <div className="flex items-center gap-1">
                <input
                    value={manualUrl}
                    onChange={(event) => { setManualUrl(event.target.value); setUrlError(""); }}
                    onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") reconnect(manualUrl); }}
                    placeholder="粘贴 dsh web 打印的带 token 地址"
                    aria-label="Harness 连接地址"
                    className="min-w-0 flex-1 rounded-md border px-2 py-1 text-[11px] outline-none"
                    style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
                />
                <button type="button" className={paneAction} onClick={() => reconnect(manualUrl)} disabled={!manualUrl.trim()}>重连</button>
                <button type="button" className={paneAction} disabled={!sidebar.url} title="用系统浏览器打开（Cookie 一定生效）" onClick={() => { if (sidebar.url) window.open(sidebar.url, "_blank", "noopener"); }}>浏览器打开</button>
            </div>
            {urlError ? <p className="mt-1 text-[11px] text-red-500">{urlError}</p> : null}
            {sidebar.url && !hasToken ? <p className="mt-1 text-[11px]" style={{ color: theme.node.muted }}>当前地址没有 token，若提示 authentication required 请粘贴 dsh web 打印的完整地址重连。</p> : null}
        </div>
    </div>;
}
