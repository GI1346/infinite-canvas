import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { App, Button, Image } from "antd";
import { FileText, Group, History, Image as ImageIcon, Images, Music2, Upload, Video, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { canvasThemes } from "@/lib/canvas-theme";
import { orderReferenceNodes } from "@/lib/canvas/canvas-resource-references";
import { useThemeStore } from "@/stores/use-theme-store";
import type { NodeGenerationInput } from "./canvas-node-generation";
import { stopWorkflowControlDrag } from "./workflow-node-interactions";
import { CanvasNodeReferenceBar } from "./canvas-node-reference-bar";
import type { CanvasNodeData } from "@/types/canvas";
import type { GalleryImage } from "@/pages/gallery/gallery-data";
import { CanvasReferenceImagePicker } from "./canvas-reference-image-picker";

type CanvasConfigComposerProps = {
    nodeId: string;
    nodes: CanvasNodeData[];
    value: string;
    inputs: NodeGenerationInput[];
    connectedNodes?: CanvasNodeData[];
    onChange: (value: string) => void;
    onClose: () => void;
    embedded?: boolean;
    expanded?: boolean;
    fontSize?: number;
    onReorderReferences?: (nodeIds: string[]) => void;
    onDisconnectReference?: (fromNodeId: string, toNodeId: string) => void;
    onStartReferenceSelection?: (nodeId: string) => void;
    onAddImageReference?: (nodeId: string, item: GalleryImage) => Promise<NodeGenerationInput>;
};

type Token =
    | { type: "text"; value: string }
    | { type: "reference"; nodeId: string };

type MentionState = {
    query: string;
};

export const CONFIG_REFERENCE_PATTERN = /@\[node:([^\]]+)\]/g;

export function CanvasConfigComposer({ nodeId, nodes, value, inputs: sourceInputs, connectedNodes = [], embedded = false, expanded = false, fontSize, onChange, onClose, onDisconnectReference, onStartReferenceSelection, onReorderReferences, onAddImageReference }: CanvasConfigComposerProps) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const editorRef = useRef<HTMLDivElement>(null);
    const caretRef = useRef<Range | null>(null);
    const uploadRef = useRef<HTMLInputElement>(null);
    const composingRef = useRef(false);
    const [mention, setMention] = useState<MentionState | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [pickerTab, setPickerTab] = useState<"all" | "history" | "gallery" | null>(null);
    const referenceOrder = nodes.find((node) => node.id === nodeId)?.metadata?.referenceNodeOrder;
    const inputs = useMemo(() => orderReferenceNodes(sourceInputs.map((input) => ({ ...input, id: input.nodeId })), referenceOrder), [sourceInputs, referenceOrder]);
    const tokens = useMemo(() => parseComposerTokens(value), [value]);
    const referenceById = useMemo(() => new Map(inputs.map((input) => [input.nodeId, input])), [inputs]);
    const candidates = useMemo(() => {
        if (!mention) return [];
        const query = (mention.query || "").trim().toLowerCase();
        if (!query) return inputs;
        return inputs.filter((input) => `${resourceLabel(input, inputs)} ${input.title} ${input.type === "group" ? "" : input.text || ""}`.toLowerCase().includes(query));
    }, [inputs, mention]);

    useEffect(() => {
        if (document.activeElement === editorRef.current) return;
        const editor = editorRef.current;
        if (!editor) return;
        editor.textContent = "";
        tokens.forEach((token) => {
            if (token.type === "text") {
                editor.append(document.createTextNode(token.value));
                return;
            }
            const input = referenceById.get(token.nodeId);
            if (input) editor.append(createReferenceChip(input, inputs, theme, setImagePreview, fontSize));
        });
    }, [fontSize, inputs, referenceById, theme, tokens]);

    const syncFromEditor = () => {
        const editor = editorRef.current;
        if (!editor) return;
        const next = serializeEditor(editor);
        onChange(next);
        rememberCaret();
        syncMention();
    };

    const rememberCaret = () => {
        const selection = window.getSelection();
        if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) caretRef.current = selection.getRangeAt(0).cloneRange();
    };

    const syncMention = () => {
        const text = textBeforeCaret();
        const match = /@([^\s@]*)$/.exec(text);
        if (!match) {
            closeMention();
            return;
        }
        setMention({ query: match[1] || "" });
        setActiveIndex(0);
    };

    const closeMention = () => {
        setMention(null);
        setActiveIndex(0);
    };

    const insertReference = (input: NodeGenerationInput) => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus({ preventScroll: true });
        const selection = window.getSelection();
        if (caretRef.current && editor.contains(caretRef.current.startContainer)) {
            selection?.removeAllRanges();
            selection?.addRange(caretRef.current);
        } else if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) placeCaretAtEnd(editor);
        removeActiveMention();
        const chip = createReferenceChip(input, referenceById.has(input.nodeId) ? inputs : [...inputs, input], theme, setImagePreview, fontSize);
        const space = document.createTextNode(" ");
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        if (range) {
            range.insertNode(space);
            range.insertNode(chip);
            range.setStartAfter(space);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
        } else {
            editor.append(chip, space);
            placeCaretAtEnd(editor);
        }
        closeMention();
        rememberCaret();
        onChange(serializeEditor(editor));
    };

    const openPicker = (tab: "all" | "history" | "gallery") => { rememberCaret(); closeMention(); setPickerTab(tab); };
    const addImage = async (item: GalleryImage) => {
        if (!onAddImageReference) return;
        const input = await onAddImageReference(nodeId, item);
        insertReference(input);
        setPickerTab(null);
    };

    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => event.stopPropagation();

    return (
        <div
            data-canvas-no-zoom
            className={embedded ? "flex h-full min-h-0 flex-col" : "rounded-xl border p-2 shadow-2xl backdrop-blur"}
            style={{ background: embedded ? "transparent" : theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text, fontSize }}
            onMouseDown={stopWorkflowControlDrag}
            onPointerDown={stopCanvasInteraction}
            onWheel={(event) => event.stopPropagation()}
        >
            {!embedded && <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                    <div className="shrink-0 text-xs font-semibold">{t("canvas.composer.title")}</div>
                    <div className="truncate text-xs opacity-55">{t("canvas.composer.description")}</div>
                </div>
                <Button size="small" type="text" className="!h-7 !w-7 !min-w-7 !p-0" icon={<X className="size-3.5" />} onClick={onClose} />
            </div>}
            <CanvasNodeReferenceBar nodeId={nodeId} nodes={nodes} connectedNodes={connectedNodes} onDisconnect={onDisconnectReference} onStartSelection={onStartReferenceSelection} onReorder={onReorderReferences} fontSize={fontSize} />
            {embedded && <div data-config-text-inputs className="mb-1.5 flex shrink-0 flex-wrap gap-1.5">{inputs.flatMap((input) => input.type === "group" ? input.children : [input]).filter((input) => input.type === "text").map((input) => <span key={input.nodeId} title={input.text || input.title} className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={{ background: theme.toolbar.activeBg, color: theme.node.text, fontSize, lineHeight: fontSize ? 1.5 : undefined }}><FileText size={fontSize || 12} /><span className="truncate">{input.title || "文本提示词"}</span></span>)}</div>}
            <div data-config-composer className={embedded ? "relative min-h-[110px] flex-1 rounded-lg" : "relative rounded-lg"}>
                {!value.trim() ? <div className="pointer-events-none absolute left-2.5 top-1.5 text-xs leading-5" style={{ color: theme.node.placeholder, fontSize, lineHeight: fontSize ? 1.5 : undefined }}>{t("canvas.composer.placeholder")}</div> : null}
                <div
                    ref={editorRef}
                    role="textbox"
                    aria-label="生成配置提示词"
                    aria-multiline="true"
                    contentEditable
                    suppressContentEditableWarning
                    className={embedded ? `thin-scrollbar h-full min-h-[96px] w-full overflow-y-auto overscroll-contain whitespace-pre-wrap break-words px-2.5 py-2 outline-none ${expanded ? "text-base leading-7" : "text-sm leading-6"}` : "thin-scrollbar min-h-16 max-h-48 w-full overflow-y-auto overscroll-contain whitespace-pre-wrap break-words px-2 py-1.5 text-xs leading-5 outline-none"}
                    style={{ color: theme.node.text, fontSize, lineHeight: fontSize ? 1.5 : undefined }}
                    onInput={() => {
                        if (!composingRef.current) syncFromEditor();
                    }}
                    onCompositionStart={() => {
                        composingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                        composingRef.current = false;
                        syncFromEditor();
                    }}
                    onKeyUp={rememberCaret}
                    onPointerUp={rememberCaret}
                    onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                        event.stopPropagation();
                        if (mention && candidates.length) {
                            if (event.key === "ArrowDown") {
                                event.preventDefault();
                                setActiveIndex((index) => (index + 1) % candidates.length);
                                return;
                            }
                            if (event.key === "ArrowUp") {
                                event.preventDefault();
                                setActiveIndex((index) => (index - 1 + candidates.length) % candidates.length);
                                return;
                            }
                            if (event.key === "Enter") {
                                event.preventDefault();
                                insertReference(candidates[Math.min(activeIndex, candidates.length - 1)]);
                                return;
                            }
                            if (event.key === "Escape") {
                                event.preventDefault();
                                closeMention();
                                return;
                            }
                        }
                        if ((event.key === "Backspace" || event.key === "Delete") && deleteAdjacentReference(event.key)) {
                            event.preventDefault();
                            requestAnimationFrame(syncFromEditor);
                            return;
                        }
                        requestAnimationFrame(syncMention);
                    }}
                    onBlur={() => { rememberCaret(); window.setTimeout(closeMention, 120); }}
                />
                {mention ? <MentionMenu anchor={editorRef.current} inputs={candidates} allInputs={inputs} activeIndex={Math.min(activeIndex, candidates.length - 1)} theme={theme} onSelect={insertReference} onActiveIndex={setActiveIndex} onUpload={onAddImageReference ? () => { rememberCaret(); closeMention(); uploadRef.current?.click(); } : undefined} onOpenPicker={onAddImageReference ? openPicker : undefined} /> : null}
            </div>
            <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={async (event) => {
                const file = event.target.files?.[0]; event.target.value = "";
                if (!file) return;
                try {
                    const { uploadImage } = await import("@/services/image-storage");
                    const image = await uploadImage(file);
                    await addImage({ id: image.storageKey || image.url, title: file.name, url: image.url, storageKey: image.storageKey, width: image.width, height: image.height, date: Date.now(), prompt: "", model: "", quality: "", sources: [{ label: "上传图片" }] });
                } catch (error) { message.error(error instanceof Error ? error.message : "添加引用失败"); }
            }} />
            {pickerTab && <CanvasReferenceImagePicker initialTab={pickerTab} onSelect={addImage} onClose={() => setPickerTab(null)} />}
            {imagePreview ? <Image src={imagePreview} alt={t("canvas.composer.imagePreview")} style={{ display: "none" }} preview={{ visible: true, src: imagePreview, onVisibleChange: (visible) => !visible && setImagePreview(null) }} /> : null}
        </div>
    );

}

function MentionMenu({ anchor, inputs, allInputs, activeIndex, theme, onSelect, onActiveIndex, onUpload, onOpenPicker }: { anchor: HTMLElement | null; inputs: NodeGenerationInput[]; allInputs: NodeGenerationInput[]; activeIndex: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onSelect: (input: NodeGenerationInput) => void; onActiveIndex: (index: number) => void; onUpload?: () => void; onOpenPicker?: (tab: "all" | "history" | "gallery") => void }) {
    const selectedRef = useRef(false);
    const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
    useLayoutEffect(() => {
        if (!anchor) return;
        const measure = () => {
            const editorRect = anchor.getBoundingClientRect(), selection = window.getSelection();
            const caretRect = selection?.rangeCount && anchor.contains(selection.anchorNode) ? selection.getRangeAt(0).getBoundingClientRect() : null;
            const rect = caretRect?.height ? caretRect : editorRect;
            const height = Math.min(292, window.innerHeight - 16), below = rect.bottom + 6;
            setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)), top: below + height <= window.innerHeight ? below : Math.max(8, rect.top - height - 6), width: Math.min(280, window.innerWidth - 16), maxHeight: height });
        };
        measure();
        window.addEventListener("resize", measure);
        window.addEventListener("scroll", measure, true);
        return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
    }, [anchor]);
    const activeItemRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        activeItemRef.current?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, inputs]);

    const selectInput = (input: NodeGenerationInput) => {
        if (selectedRef.current) return;
        selectedRef.current = true;
        onSelect(input);
    };

    return (
        createPortal(<div data-config-mention-menu data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore className="fixed z-[1300] flex flex-col overflow-hidden rounded-xl border p-1 shadow-2xl" style={{ ...position, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text, fontSize: 12, lineHeight: "18px" }} onPointerDown={(event) => { event.stopPropagation(); if (!(event.target instanceof HTMLElement && event.target.closest("[data-mention-scroll]"))) event.preventDefault(); }} onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
            {onUpload && <button type="button" className="flex w-full shrink-0 items-center gap-2 rounded-lg px-2 py-2 text-left hover:opacity-70" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onUpload(); }} onClick={(event) => { if (event.detail === 0) onUpload(); }}><Upload size={14} />上传图片</button>}
            <div data-mention-scroll role="listbox" aria-label="引用上游内容" className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ maxHeight: 204 }}>
            {inputs.map((input, index) => (
                <button
                    key={input.nodeId}
                    ref={index === activeIndex ? activeItemRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition"
                    style={{ background: index === activeIndex ? theme.toolbar.activeBg : "transparent", color: index === activeIndex ? theme.toolbar.activeText : theme.node.text, fontSize: 12, lineHeight: "18px" }}
                    onPointerEnter={() => onActiveIndex(index)}
                    onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectInput(input);
                    }}
                    onClick={() => selectInput(input)}
                >
                    <ResourcePreview input={input} />
                    <span className="min-w-0 flex-1 overflow-hidden">
                        <span className="block truncate font-medium">{resourceLabel(input, allInputs)}</span>
                        <span className="block truncate opacity-65">{input.type === "group" ? i18n.t("canvas.node.nodeCount", { count: input.children.length }) : input.text || input.title}</span>
                    </span>
                </button>
            ))}
            {!inputs.length && <p className="px-2 py-4 text-center opacity-60">没有匹配的上游内容</p>}
            </div>
            {onOpenPicker && <div className="mt-1 flex shrink-0 border-t pt-1" style={{ borderColor: theme.toolbar.border }}>{[{ tab: "history" as const, label: "生成历史", Icon: History }, { tab: "gallery" as const, label: "图片库", Icon: Images }].map(({ tab, label, Icon }) => <button key={tab} type="button" className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg py-2 hover:opacity-70" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onOpenPicker(tab); }} onClick={(event) => { if (event.detail === 0) onOpenPicker(tab); }}><Icon size={14} />{label}</button>)}</div>}
        </div>, document.body)
    );
}

function ResourcePreview({ input }: { input: NodeGenerationInput }) {
    if (input.type === "group") return <span className="grid size-7 shrink-0 place-items-center"><Group className="size-4" /></span>;
    if (input.type === "image" && input.image) return <img src={input.image.dataUrl} alt="" className="size-7 shrink-0 rounded-md object-cover" />;
    if (input.type === "video" && input.video) return <video src={input.video.url} className="size-7 shrink-0 rounded-md bg-black object-cover" muted preload="metadata" />;
    const Icon = input.type === "audio" ? Music2 : input.type === "video" ? Video : input.type === "image" ? ImageIcon : FileText;
    return (
        <span className="grid size-7 shrink-0 place-items-center rounded-md">
            <Icon className="size-4" />
        </span>
    );
}

function createReferenceChip(input: NodeGenerationInput, inputs: NodeGenerationInput[], theme: (typeof canvasThemes)[keyof typeof canvasThemes], onImagePreview: (url: string) => void, fontSize?: number) {
    const wrapper = document.createElement("span");
    wrapper.contentEditable = "false";
    wrapper.dataset.referenceNodeId = input.nodeId;
    wrapper.className = "mx-px inline-flex h-7 max-w-40 items-center justify-center overflow-hidden rounded-md border px-1 text-xs leading-none align-middle";
    Object.assign(wrapper.style, chipStyle(theme), fontSize ? { fontSize: `${fontSize}px`, height: "1.25em", maxWidth: "10em" } : {});
    if (input.type === "image" && input.image) {
        const image = document.createElement("img");
        image.src = input.image.dataUrl;
        image.alt = input.title;
        image.className = "size-7 rounded object-cover";
        wrapper.className = "mx-px inline-flex size-7 items-center justify-center overflow-hidden rounded align-middle";
        wrapper.style.width = "28px";
        wrapper.style.height = "28px";
        wrapper.appendChild(image);
        wrapper.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onImagePreview(input.image?.dataUrl || "");
        });
    } else {
        wrapper.title = input.type === "group" ? input.title : input.text || input.title;
        const text = document.createElement("span");
        text.className = "block truncate";
        text.textContent = input.type === "text" ? input.text || input.title : input.title;
        wrapper.appendChild(text);
    }
    return wrapper;
}

function serializeEditor(editor: HTMLElement) {
    return serializeNodes(editor.childNodes).replace(/\uFEFF/g, "");
}

function serializeNodes(nodes: NodeListOf<ChildNode>) {
    let result = "";
    nodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) result += node.textContent || "";
        if (!(node instanceof HTMLElement)) return;
        const nodeId = node.dataset.referenceNodeId;
        if (nodeId) result += `@[node:${nodeId}]`;
        else if (node.tagName === "BR") result += "\n";
        else {
            const block = node.tagName === "DIV" || node.tagName === "P";
            if (block && node.previousSibling) result += "\n";
            const content = serializeNodes(node.childNodes);
            result += block && content === "\n" ? "" : content;
            if (block && node.nextSibling && !(node.nextSibling instanceof HTMLElement && ["DIV", "P"].includes(node.nextSibling.tagName))) result += "\n";
        }
    });
    return result;
}

function removeActiveMention() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const text = textBeforeCaret();
    const match = /@([^\s@]*)$/.exec(text);
    if (!match) return;
    range.setStart(range.startContainer, Math.max(0, range.startOffset - (match[1] || "").length - 1));
    range.deleteContents();
}

function deleteAdjacentReference(key: string) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    const target = adjacentReferenceNode(range, key);
    if (!target) return false;
    const nextCaretNode = document.createTextNode("");
    target.replaceWith(nextCaretNode);
    range.setStart(nextCaretNode, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

function adjacentReferenceNode(range: Range, key: string) {
    const container = range.startContainer;
    const offset = range.startOffset;
    const previous = key === "Backspace";
    if (container.nodeType === Node.TEXT_NODE) {
        const text = container.textContent || "";
        if ((previous && offset > 0) || (!previous && offset < text.length)) return null;
        return findReferenceSibling(container, previous);
    }
    const children = Array.from(container.childNodes);
    return findReferenceSibling(children[previous ? offset - 1 : offset] || container, previous, true);
}

function findReferenceSibling(node: Node, previous: boolean, includeSelf = false): HTMLElement | null {
    let current: Node | null = includeSelf ? node : previous ? node.previousSibling : node.nextSibling;
    while (current && current.nodeType === Node.TEXT_NODE && !(current.textContent || "").trim()) current = previous ? current.previousSibling : current.nextSibling;
    return current instanceof HTMLElement && current.dataset.referenceNodeId ? current : null;
}

function textBeforeCaret() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return "";
    const range = selection.getRangeAt(0).cloneRange();
    const editor = closestEditor(range.startContainer);
    if (!editor) return "";
    range.setStart(editor, 0);
    return range.toString();
}

function closestEditor(node: Node) {
    const element = node instanceof Element ? node : node.parentElement;
    return element?.closest("[contenteditable='true']") || null;
}

function placeCaretAtEnd(element: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

function parseComposerTokens(value: string): Token[] {
    const tokens: Token[] = [];
    let lastIndex = 0;
    for (const match of value.matchAll(CONFIG_REFERENCE_PATTERN)) {
        if (match.index === undefined) continue;
        if (match.index > lastIndex) tokens.push({ type: "text", value: value.slice(lastIndex, match.index) });
        tokens.push({ type: "reference", nodeId: match[1] });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) tokens.push({ type: "text", value: value.slice(lastIndex) });
    return tokens;
}

function resourceLabel(input: NodeGenerationInput, inputs: NodeGenerationInput[]) {
    const sameTypeInputs = inputs.filter((item) => item.type === input.type);
    const index = Math.max(0, sameTypeInputs.findIndex((item) => item.nodeId === input.nodeId));
    return i18n.t(`canvas.composer.resources.${input.type}`, { index: index + 1 });
}

function chipStyle(theme: (typeof canvasThemes)[keyof typeof canvasThemes]): CSSProperties {
    return { background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text };
}
