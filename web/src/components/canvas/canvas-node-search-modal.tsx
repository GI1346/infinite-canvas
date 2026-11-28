import { memo, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search, X } from "lucide-react";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const NODE_META: Record<string, { label: string; color: string }> = {
    [CanvasNodeType.Image]: { label: "图片", color: "#38bdf8" },
    [CanvasNodeType.Config]: { label: "生成配置", color: "#0ea977" },
    [CanvasNodeType.Text]: { label: "文本", color: "#94a3b8" },
    [CanvasNodeType.Video]: { label: "视频", color: "#f472b6" },
    [CanvasNodeType.Audio]: { label: "音频", color: "#fb923c" },
    [CanvasNodeType.Group]: { label: "分组", color: "#64748b" },
    "dxos:table": { label: "多维表格", color: "#0ea977" },
    "dxos:concurrent": { label: "并发生成", color: "#37d39b" },
    "dxos:llm": { label: "AI 多模态", color: "#a78bfa" },
    "blinkflow:fusion": { label: "局部融合", color: "#f59e0b" },
    "blinkflow:director": { label: "3D 导演台", color: "#ec4899" },
    "character-recipe": { label: "角色合成", color: "#ec4899" },
};

export function nodeTypeMeta(type: string) {
    return NODE_META[type] || { label: "节点", color: "#94a3b8" };
}

function nodeSnippet(node: CanvasNodeData) {
    const raw = node.metadata?.composerContent || node.metadata?.prompt || (node.type === CanvasNodeType.Text ? node.metadata?.content : "") || "";
    return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

const stop = (event: { stopPropagation(): void }) => event.stopPropagation();

export const CanvasNodeSearchModal = memo(function CanvasNodeSearchModal({
    open,
    nodes,
    runningNodeIds,
    onClose,
    onSelectNode,
}: {
    open: boolean;
    nodes: CanvasNodeData[];
    runningNodeIds?: Set<string>;
    onClose: () => void;
    onSelectNode: (nodeId: string) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        setQuery("");
        setActiveIndex(0);
        const timer = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(timer);
    }, [open]);

    const items = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        return nodes
            .map((node) => ({ node, meta: nodeTypeMeta(node.type), snippet: nodeSnippet(node) }))
            .filter(({ node, meta, snippet }) => {
                if (!keyword) return true;
                return (
                    (node.title || "").toLowerCase().includes(keyword) ||
                    meta.label.toLowerCase().includes(keyword) ||
                    snippet.toLowerCase().includes(keyword)
                );
            });
    }, [nodes, query]);

    useEffect(() => {
        setActiveIndex((current) => (items.length ? Math.min(current, items.length - 1) : 0));
    }, [items.length]);

    if (!open) return null;

    const pick = (nodeId: string) => {
        onSelectNode(nodeId);
        onClose();
    };

    return (
        <div
            data-canvas-overlay
            data-canvas-no-zoom
            data-canvas-shortcuts-ignore
            role="dialog"
            aria-label="快速定位画布节点"
            className="fixed inset-0 z-[120] flex items-start justify-center bg-black/35 px-4 pt-[12vh] backdrop-blur-[2px]"
            onPointerDown={(event) => {
                event.stopPropagation();
                if (event.target === event.currentTarget) onClose();
            }}
            onMouseDown={stop}
            onWheel={stop}
        >
            <div
                className="bf-spring-pop w-full max-w-[460px] overflow-hidden rounded-2xl border text-xs"
                style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") { event.preventDefault(); onClose(); }
                    else if (event.key === "ArrowDown" && items.length) { event.preventDefault(); setActiveIndex((i) => (i + 1) % items.length); }
                    else if (event.key === "ArrowUp" && items.length) { event.preventDefault(); setActiveIndex((i) => (i - 1 + items.length) % items.length); }
                    else if (event.key === "Enter" && items[activeIndex]) { event.preventDefault(); pick(items[activeIndex].node.id); }
                }}
            >
                <div className="flex items-center gap-2 border-b px-3.5 py-2.5" style={{ borderColor: theme.glass.insetBorder }}>
                    <Search className="size-4 shrink-0 opacity-60" />
                    <input
                        ref={inputRef}
                        aria-label="搜索画布节点"
                        placeholder="搜索节点标题、提示词或类型（图片 / 多维表格 / 融合…）"
                        value={query}
                        onChange={(event) => setQuery(event.currentTarget.value)}
                        className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                        style={{ color: theme.node.text }}
                    />
                    <span className="shrink-0 font-mono text-[10px]" style={{ color: theme.node.muted }}>{items.length}/{nodes.length}</span>
                    <button type="button" aria-label="关闭节点搜索" className="grid size-6 shrink-0 place-items-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.muted }} onClick={onClose}><X className="size-3.5" /></button>
                </div>
                <div data-node-scroll className="thin-scrollbar max-h-[340px] overflow-y-auto overscroll-contain p-1.5">
                    {items.length ? items.map(({ node, meta, snippet }, index) => {
                        const active = index === activeIndex;
                        const running = runningNodeIds?.has(node.id);
                        return (
                            <button
                                key={node.id}
                                type="button"
                                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition"
                                style={{ background: active ? theme.accent.soft : "transparent" }}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => pick(node.id)}
                            >
                                <span className={`size-2 shrink-0 rounded-full ${running ? "animate-pulse" : ""}`} style={{ background: running ? theme.accent.base : meta.color }} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate font-medium" style={{ color: active ? theme.accent.base : theme.node.text }}>{node.title || meta.label}</span>
                                        {running && <span className="shrink-0 rounded-full px-1.5 py-0.2 text-[10px] font-medium" style={{ background: theme.accent.soft, color: theme.accent.base }}>生成中</span>}
                                    </div>
                                    {snippet && <p className="m-0 mt-0.5 truncate text-[11px]" style={{ color: theme.node.muted }}>{snippet}</p>}
                                </div>
                                <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px]" style={{ background: theme.glass.inset, color: theme.node.muted }}>{meta.label}</span>
                            </button>
                        );
                    }) : (
                        <div className="py-10 text-center" style={{ color: theme.node.muted }}>{nodes.length ? "没有匹配的画布节点" : "当前画布还没有节点"}</div>
                    )}
                </div>
                <div className="flex items-center justify-between border-t px-3.5 py-2 text-[10px]" style={{ borderColor: theme.glass.insetBorder, color: theme.node.muted }}>
                    <span>↑ ↓ 选择 · Esc 关闭</span>
                    <span className="inline-flex items-center gap-1"><CornerDownLeft className="size-3" />回车定位并选中</span>
                </div>
            </div>
        </div>
    );
});
