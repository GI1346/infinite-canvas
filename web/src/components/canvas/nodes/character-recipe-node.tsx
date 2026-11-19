import { useEffect, useRef, useState, type DragEvent } from "react";
import { ArrowLeftRight, Check, Sparkles, Dice5, Grid2X2, ImagePlus, Link2, Play, Plus, Shirt, Square, Upload, UserRound, PersonStanding, X, Drama } from "lucide-react";
import { nanoid } from "nanoid";

import { ModelPicker } from "@/components/model-picker";
import { getGenerationCount } from "@/lib/canvas/canvas-generation-helpers";
import { arrangeGrid } from "@/lib/canvas/canvas-grid-layout";
import { imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { fitNodeSize, NODE_PANEL_CONTENT_WIDTH, NODE_PANEL_WIDTH } from "@/lib/canvas/canvas-node-size";
import { markNodeCreated } from "@/lib/canvas/canvas-node-creation";
import { makeRecipeCollage, readRecipeImage, recipeLinkedNodes, recipeReferences, type RecipeReference } from "@/lib/canvas/canvas-character-recipe";
import { readFileAsDataUrl } from "@/lib/image-utils";
import { computeMediaSize, inferMediaRatio, inferMediaScale, mediaRatioOptions, mediaScaleOptions } from "@/lib/media-size";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { buildCharacterRecipePrompt, loadPoseGalleryData, loadPoseGallerySlot, randomizeSlotItem, recipeSlotLabels, recipeSlots, type CharacterRecipe, type RecipeSelection, type RecipeSlot } from "@/services/api/pose-gallery";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { CanvasNodeType, CHARACTER_RECIPE_NODE_TYPE, type CanvasNodeData } from "@/types/canvas";
import type { CanvasNodeContext, CanvasNodeDefinition } from "@/types/canvas-plugin";
import { CharacterRecipePickerModal, CharacterRecipePreviewModal, RecipeDepthToggle } from "./character-recipe-picker-modal";

export const characterRecipeTitle = "角色三合一合成";
export const characterRecipeDescription = "人像 · 服装 · 姿势（白模／深度）选图、随机与连线合成";
const styles = ["跟随参考图", "写实人像写真", "日系二次元插画", "3D 次世代渲染"];
const outputRatios = mediaRatioOptions.filter(({ value }) => value !== "auto");
const outputResolutions = mediaScaleOptions.filter((value) => value !== "auto");
const icons = { portrait: UserRound, costume: Shirt, pose: PersonStanding };
const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
const problem = (error: unknown) => error instanceof Error ? error.message : "操作失败，请重试。";
type Preview = { title: string; open: boolean; mousePosition?: { x: number; y: number }; image?: string; error?: string; collage?: boolean };
const runStages = ["读取参考图", "等待模型", "保存结果"] as const;

function RecipeThumbnail({ reference }: { reference: RecipeReference }) {
    const [resolved, setResolved] = useState("");
    useEffect(() => {
        let active = true;
        setResolved("");
        if (reference.storageKey) void resolveImageUrl(reference.storageKey, reference.url).then((url) => { if (active) setResolved(url); }).catch(() => undefined);
        return () => { active = false; };
    }, [reference.storageKey, reference.url]);
    const src = reference.thumbnail || (reference.storageKey ? resolved : reference.url);
    return src ? <img className="h-full w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-105" alt="" src={src} draggable={false} referrerPolicy="no-referrer" /> : <ImagePlus size={16} />;
}

export function CharacterRecipeNode({ ctx }: { ctx: CanvasNodeContext }) {
    const { node, theme } = ctx, config = useEffectiveConfig();
    const recipe = node.metadata?.characterRecipe || {};
    const model = node.metadata?.model || ctx.ai.defaultModel("image");
    const defaultRatio = inferMediaRatio(config.size);
    const defaultResolution = inferMediaScale(config.size, config.imageResolution);
    const ratio = node.metadata?.imageAspectRatio || (outputRatios.some(({ value }) => value === defaultRatio) ? defaultRatio : "1:1");
    const resolution = node.metadata?.imageResolution || (defaultResolution === "auto" ? "1k" : defaultResolution);
    const outputSize = computeMediaSize(resolution, ratio);
    const setOutputSize = (imageAspectRatio: string, imageResolution: string) => ctx.updateMetadata({ imageAspectRatio, imageResolution, size: computeMediaSize(imageResolution, imageAspectRatio) });
    const live = useRef(ctx);
    live.current = ctx;
    const [linked, setLinked] = useState(() => recipeLinkedNodes(node.id, ctx.getNodes(), ctx.getConnections()));
    const [safe, setSafe] = useState(true);
    const [picker, setPicker] = useState<RecipeSlot>();
    const [preview, setPreview] = useState<Preview>();
    const [stage, setStage] = useState<0 | 1 | 2 | null>(null);
    const running = stage !== null;
    const [dragSlot, setDragSlot] = useState<RecipeSlot>();
    const [preparing, setPreparing] = useState(false);
    const [error, setError] = useState("");
    const previewTask = useRef<AbortController | undefined>(undefined);
    const generation = useRef<AbortController | undefined>(undefined);
    const mounted = useRef(true);
    const readLinked = () => recipeLinkedNodes(node.id, live.current.getNodes(), live.current.getConnections());
    const references = recipeReferences(recipe, linked);
    const automaticPrompt = (refs: RecipeReference[], state: CharacterRecipe) => buildCharacterRecipePrompt(refs, state.style || styles[0], refs.some((ref) => ref.depth), state.useCollage);
    const currentRecipe = () => live.current.getNode(node.id)?.metadata?.characterRecipe || {};
    const patchRecipe = (patch: Partial<CharacterRecipe>) => live.current.updateMetadata({ characterRecipe: { ...currentRecipe(), ...patch } });
    useEffect(() => {
        const refresh = () => setLinked(recipeLinkedNodes(node.id, live.current.getNodes(), live.current.getConnections()));
        refresh();
        return live.current.on("canvas:graph-changed", refresh);
    }, [node.id]);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; previewTask.current?.abort(); generation.current?.abort(); };
    }, []);

    const choose = (slot: RecipeSlot, selection?: RecipeSelection) => {
        if (readLinked()[slot]) return;
        patchRecipe({ slots: { ...currentRecipe().slots, [slot]: selection } });
        setError("");
    };
    const prepare = async (task: (isCurrent: () => boolean) => Promise<void>) => {
        setPreparing(true); setError("");
        const projectId = live.current.getProjectId?.();
        const isCurrent = () => mounted.current && live.current.getProjectId?.() === projectId && !!live.current.getNode(node.id);
        try { await task(isCurrent); }
        catch (e) { if (isCurrent()) setError(problem(e)); }
        finally { if (isCurrent()) setPreparing(false); }
    };
    const randomize = (only?: RecipeSlot) => void prepare(async (isCurrent) => {
        const connected = readLinked();
        const available = (only ? [only] : recipeSlots).filter((slot) => !connected[slot]);
        const data = available.length === recipeSlots.length ? await loadPoseGalleryData() : Object.fromEntries(await Promise.all(available.map(async (slot) => [slot, await loadPoseGallerySlot(slot)] as const)));
        if (!isCurrent()) return;
        const state = currentRecipe(), connections = readLinked(), slots = { ...state.slots };
        let changed = false;
        for (const slot of only ? [only] : recipeSlots) {
            if (connections[slot]) continue;
            const old = slots[slot];
            const item = randomizeSlotItem(slot, data[slot] || [], old?.kind === "gallery" ? old.item : undefined, only ? state.scopes?.[slot] : "all", safe);
            if (item) { slots[slot] = { kind: "gallery", item }; changed = true; }
        }
        if (!changed) throw new Error(only ? "当前范围没有可替换的图片，可以切换到「全部」。" : "没有可随机替换的槽位。");
        patchRecipe({ slots });
    });
    const upload = (slot: RecipeSlot, file: File) => void prepare(async (isCurrent) => {
        if (file.type && !file.type.startsWith("image/")) throw new Error("请选择图片文件。");
        const image = await uploadImage(file);
        if (isCurrent() && image.storageKey) choose(slot, { kind: "upload", name: file.name, storageKey: image.storageKey });
    });

    const handleSlotDrag = (event: DragEvent<HTMLDivElement>, slot: RecipeSlot) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.stopPropagation();
        const locked = Boolean(readLinked()[slot]);
        const blocked = busy || Boolean(generation.current) || locked;
        if (event.type !== "drop") {
            const items = Array.from(event.dataTransfer.items);
            const acceptsImage = !items.length || items.some((item) => item.kind === "file" && (!item.type || item.type.startsWith("image/")));
            event.dataTransfer.dropEffect = !blocked && acceptsImage ? "copy" : "none";
            setDragSlot(!busy && (acceptsImage || locked) ? slot : undefined);
            return;
        }
        setDragSlot(undefined);
        if (blocked) return;
        const file = Array.from(event.dataTransfer.files).find((item) => !item.type || item.type.startsWith("image/"));
        if (file) upload(slot, file);
    };

    const closePreview = () => {
        previewTask.current?.abort();
        setPreview((current) => current && { ...current, open: false });
    };
    const showPreview = (ref?: RecipeReference, trigger?: HTMLElement) => {
        previewTask.current?.abort();
        const controller = new AbortController();
        previewTask.current = controller;
        const title = ref?.name || "三合一参考拼图";
        const rect = trigger?.getBoundingClientRect();
        const initial: Preview = { title, collage: !ref, open: true, mousePosition: rect ? { x: rect.left + rect.width / 2 + window.scrollX, y: rect.top + rect.height / 2 + window.scrollY } : undefined };
        setPreview(initial);
        void (async () => {
            try {
                if (ref && !ref.storageKey && ref.url) { setPreview({ ...initial, image: ref.url }); return; }
                const images = await Promise.all((ref ? [ref] : references).map((input) => readRecipeImage(input, controller.signal)));
                const image = ref ? await readFileAsDataUrl(new File([images[0]], "reference", { type: images[0].type })) : await makeRecipeCollage(images, controller.signal);
                if (!controller.signal.aborted) setPreview({ ...initial, image });
            } catch (e) { if (!controller.signal.aborted) setPreview({ ...initial, error: problem(e) }); }
        })();
    };

    const run = async () => {
        if (generation.current) return;
        const selected = recipeReferences(currentRecipe(), readLinked());
        if (!selected.length) return;
        const state = currentRecipe();
        const prompt = state.prompt?.trim() || automaticPrompt(selected, state);
        const controller = new AbortController(), signal = controller.signal;
        const projectId = ctx.getProjectId?.();
        const isCurrent = () => mounted.current && live.current.getProjectId?.() === projectId && !!live.current.getNode(node.id);
        generation.current = controller;
        setDragSlot(undefined); setStage(0); setError("");
        ctx.updateMetadata({ status: "loading", errorDetails: undefined });
        try {
            const images = await Promise.all(selected.map((input) => readRecipeImage(input, signal)));
            const inputImages = state.useCollage ? [await makeRecipeCollage(images, signal)] : await Promise.all(images.map((image) => readFileAsDataUrl(new File([image], "reference", { type: image.type }))));
            signal.throwIfAborted();
            if (!isCurrent()) return;
            setStage(1);
            const result = await ctx.ai.generateImage(prompt, { model, references: inputImages, size: outputSize, resolution, count: getGenerationCount(config.canvasImageCount || config.count), waitForCompletion: true, signal, onModelResult: () => { if (isCurrent() && !signal.aborted) setStage(2); } });
            if (!result.images.length) throw new Error("模型没有返回图片。");
            const stored = await Promise.all(result.images.map((url) => uploadImage(url, { signal })));
            signal.throwIfAborted();
            if (!isCurrent()) return;
            const source = live.current.getNode(node.id)!;
            const floor = Math.max(source.position.y, ...live.current.getDownstream().filter((item) => item.type === CanvasNodeType.Image).map((item) => item.position.y + item.height + 24));
            const output: CanvasNodeData[] = stored.map((image, index) => ({ id: nanoid(), type: CanvasNodeType.Image, title: stored.length > 1 ? `角色合成 ${index + 1}` : "角色合成", position: { x: source.position.x + source.width + 80, y: floor }, ...fitNodeSize(image.width, image.height), metadata: { ...imageMetadata(image), prompt, model, imageAspectRatio: ratio, imageResolution: resolution, size: outputSize } }));
            const ids = new Set(output.map((item) => item.id));
            const arranged = arrangeGrid(output, ids, 4, 24);
            for (const item of arranged) markNodeCreated(item.id);
            live.current.applyOps([
                ...arranged.flatMap(({ type: nodeType, ...item }) => ([{ ...item, type: "add_node", nodeType }, { type: "connect_nodes", fromNodeId: node.id, toNodeId: item.id }] as const)),
                { type: "update_node", id: node.id, metadata: { status: "success", errorDetails: undefined } },
                { type: "select_nodes", ids: [...ids] },
            ]);
        } catch (e) {
            if (isCurrent()) {
                const details = signal.aborted ? undefined : problem(e);
                live.current.updateMetadata({ status: signal.aborted ? "idle" : "error", errorDetails: details });
                setError(details || "已停止合成。");
            }
        } finally {
            generation.current = undefined;
            if (isCurrent()) setStage(null);
        }
    };

    const busy = preparing || running;
    const compact = node.height < 420;
    const inset = { background: theme.glass.inset, borderColor: theme.node.stroke, color: theme.node.text };
    const accent = { background: theme.accent.soft, color: theme.toolbar.activeText };
    const chip = "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-medium transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 disabled:opacity-40";
    const hud = "pointer-events-auto rounded-full bg-black/55 text-white ring-1 ring-inset ring-white/20 backdrop-blur-md";
    const styleLabels = ["跟随参考", "写实写真", "二次元", "3D 渲染"];
    const activeStyle = Math.max(0, styles.indexOf(recipe.style || styles[0]));
    return <div data-node-scroll className={`thin-scrollbar flex h-full min-h-0 flex-col overflow-y-auto rounded-[14px] text-xs ${compact ? "p-3" : "p-3.5"}`} style={{ color: theme.node.text, background: theme.node.panel }}>
        <header className={`flex shrink-0 items-center justify-between gap-1.5 ${compact ? "mb-1.5" : "mb-2.5"}`}>
            <div className="flex min-w-0 items-center gap-1.5">
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold" style={accent}><Sparkles size={12} />角色合成台</span>
                <span className="whitespace-nowrap text-[10px] tabular-nums" style={{ color: theme.node.muted }}>已配 <span className="font-semibold" style={{ color: theme.accent.base }}>{references.length}</span>/3</span>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 rounded-xl p-0.5" data-node-no-drag onMouseDown={stop} style={inset}>
                <button type="button" aria-label="参考拼图" aria-pressed={Boolean(recipe.useCollage)} disabled={busy || !references.length} className={chip} style={recipe.useCollage ? accent : undefined} onClick={(event) => recipe.useCollage ? patchRecipe({ useCollage: false }) : showPreview(undefined, event.currentTarget)}><Grid2X2 size={12} />参考拼图</button>
                <button type="button" aria-label="随机" disabled={busy || recipeSlots.every((slot) => linked[slot])} className={chip} onClick={() => randomize()}><Dice5 size={12} />全套随机</button>
            </div>
        </header>
        <fieldset disabled={busy} className="grid shrink-0 grid-cols-3 gap-2.5" data-node-no-drag onMouseDown={stop}>
            {recipeSlots.map((slot) => {
                const Icon = icons[slot], ref = references.find((item) => item.slot === slot), label = recipeSlotLabels[slot];
                const scope = recipe.scopes?.[slot] || "similar";
                const isDropTarget = dragSlot === slot && !busy;
                const galleryPose = slot === "pose" && !ref?.linked && recipe.slots?.pose?.kind === "gallery";
                return <div key={slot} data-recipe-drop-slot={slot} onDragOver={(event) => handleSlotDrag(event, slot)} onDrop={(event) => handleSlotDrag(event, slot)} onDragLeave={(event) => {
                    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragSlot((current) => current === slot ? undefined : current);
                }} className={`group relative flex h-[148px] min-w-0 flex-col overflow-hidden rounded-xl border transition ${ref ? "" : "border-dashed hover:brightness-105"}`} style={ref ? { borderColor: theme.node.stroke, background: theme.node.fill } : { borderColor: `color-mix(in srgb, ${theme.accent.base} 40%, transparent)`, background: `radial-gradient(ellipse at center, ${theme.accent.soft}, transparent 80%)` }}>
                    {ref ? <button type="button" aria-label={`预览 ${ref.name}`} className="absolute inset-0 grid place-items-center overflow-hidden focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2" style={{ color: theme.node.muted }} disabled={!ref.url && !ref.storageKey} onClick={(event) => showPreview(ref, event.currentTarget)}><RecipeThumbnail reference={ref} /></button> : <button type="button" aria-label={`选${label}`} className="absolute inset-x-0 inset-y-6 flex flex-col items-center justify-center gap-1.5 rounded-lg text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2" style={{ color: theme.toolbar.activeText }} onClick={() => setPicker(slot)}><span className="grid size-9 place-items-center rounded-xl" style={accent}><Icon size={17} strokeWidth={1.6} /></span><span className="flex items-center gap-0.5"><Plus size={11} />挑选{label}</span></button>}
                    <div className={`pointer-events-none relative z-10 flex items-center justify-between gap-0.5 p-1.5 ${ref ? "bg-gradient-to-b from-black/70 via-black/25 to-transparent" : ""}`}>
                        <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-medium ${ref ? "bg-black/55 text-white ring-1 ring-inset ring-white/20 backdrop-blur-md" : ""}`} title={`${label}输入`} style={ref ? undefined : accent}>{ref?.linked ? <><Link2 size={10} className="text-emerald-300" />上游连线</> : <>{!galleryPose && <Icon size={10} />}{label}</>}</span>
                        <div className="pointer-events-auto flex min-w-0 items-center gap-0.5">
                            {galleryPose && <RecipeDepthToggle value={Boolean(recipe.useDepth)} onChange={(useDepth) => patchRecipe({ useDepth })} />}
                            {ref ? !ref.linked && <button type="button" className={`grid size-5 shrink-0 place-items-center focus-visible:outline ${hud}`} aria-label={`清除${label}`} title={`清除${label}`} onClick={() => choose(slot)}><X size={11} /></button> : <label className="grid size-6 cursor-pointer place-items-center rounded-full transition hover:brightness-110 focus-within:outline" style={accent} title={`上传${label}`}><Upload size={11} /><input type="file" accept="image/*" aria-label={`上传${label}`} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) upload(slot, file); }} /></label>}
                        </div>
                    </div>
                    <div className={`pointer-events-none relative z-10 mt-auto flex flex-col gap-0.5 px-1.5 pb-1.5 ${ref ? "bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-4 text-white" : ""}`}>
                        {ref && <div title={ref.name} className="w-full truncate px-0.5 text-[10px] font-medium text-white/95">{ref.name}</div>}
                        <div className="flex items-center justify-between gap-0.5">
                            <button type="button" aria-label={`${label}随机范围`} aria-pressed={scope === "all"} title={`当前：${scope === "all" ? "全库" : "同类"}，点击切换`} className={`${chip} pointer-events-auto gap-0.5 px-1.5 py-0.5 ${ref ? hud : ""}`} style={ref ? undefined : inset} disabled={Boolean(ref?.linked)} onClick={() => patchRecipe({ scopes: { ...currentRecipe().scopes, [slot]: scope === "all" ? "similar" : "all" } })}>{scope === "all" ? "全库" : "同类"}<ArrowLeftRight size={9} /></button>
                            <button type="button" aria-label={`换一个${label}`} className={`${chip} pointer-events-auto gap-0.5 px-1.5 py-0.5 ${ref ? hud : ""}`} style={ref ? undefined : accent} disabled={Boolean(ref?.linked)} onClick={() => randomize(slot)}><Dice5 size={11} className={ref ? "text-emerald-300" : undefined} />换一张</button>
                        </div>
                    </div>
                    {isDropTarget && <div role="status" className="pointer-events-none absolute inset-0 z-30 grid place-items-center gap-1 rounded-lg text-[11px] font-semibold motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-100" style={{ background: `color-mix(in srgb, ${theme.node.panel} 90%, transparent)`, color: ref?.linked ? theme.node.text : theme.toolbar.activeText, boxShadow: ref?.linked ? undefined : `inset 0 0 0 2px ${theme.accent.base}` }}><span className="inline-flex items-center gap-1">{ref?.linked ? <Link2 size={12} /> : <Upload size={12} />}{ref?.linked ? "由上游提供" : `松开以放入${label}`}</span></div>}
                </div>;
            })}
        </fieldset>
        <div className={`flex flex-1 flex-col gap-1.5 ${compact ? "mt-2 min-h-[88px]" : "mt-3 min-h-[94px]"}`} data-node-no-drag onMouseDown={stop}>
            <div className="flex shrink-0 items-center gap-1.5">
                <span className="shrink-0 font-semibold">画风</span>
                <div role="group" aria-label="画风" className="relative grid min-w-0 grid-cols-4 rounded-full p-0.5" style={inset}>
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0.5"><span data-recipe-style-pill className="block h-full w-1/4 rounded-full motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out" style={{ background: theme.accent.soft, boxShadow: `inset 0 0 0 1px ${theme.accent.soft}`, transform: `translateX(${activeStyle * 100}%)` }} /></div>
                    {styles.map((style, index) => <button key={style} type="button" aria-label={style} aria-pressed={index === activeStyle} disabled={running} className={`${chip} relative justify-center`} style={{ color: index === activeStyle ? theme.toolbar.activeText : theme.node.muted }} onClick={() => patchRecipe({ style })}>{styleLabels[index]}</button>)}
                </div>
            </div>
            <textarea aria-label="合成提示词" data-node-scroll className="min-h-[44px] w-full flex-1 resize-none select-text overscroll-contain rounded-xl border p-2 text-[11px] leading-relaxed outline-none focus:ring-1" style={{ ...inset, outlineColor: theme.accent.base, ["--tw-ring-color" as string]: theme.accent.base }} disabled={running} value={recipe.prompt ?? automaticPrompt(references, recipe)} onChange={(event) => patchRecipe({ prompt: event.target.value })} />
            {stage !== null ? <div className="grid shrink-0 grid-cols-3 gap-1.5" role="status" aria-label={`合成进度：${runStages[stage]}`}>
                {runStages.map((label, index) => <span key={label} className="flex min-w-0 items-center justify-center gap-0.5 whitespace-nowrap rounded-md px-0.5 text-[10px] motion-safe:transition-colors motion-safe:duration-150" data-recipe-stage={index} aria-current={index === stage ? "step" : undefined} style={index === stage ? accent : { color: theme.node.muted }}>
                    {index < stage ? <Check size={10} /> : <span className="size-1.5 shrink-0 rounded-full" style={{ background: index === stage ? theme.accent.base : theme.node.stroke }} />}{label}
                </span>)}
            </div> :
            <div className="flex shrink-0 items-center justify-between gap-1 text-[10px]" style={{ color: theme.node.muted }}><span className="truncate">{recipe.useCollage ? "已使用参考拼图" : "按人像、服装、姿势顺序提交"}</span>{(recipe.prompt !== undefined || recipe.useCollage) && <div className="flex shrink-0 gap-2">{recipe.useCollage && <button type="button" disabled={running} onClick={() => patchRecipe({ useCollage: false })}>改用单图</button>}{recipe.prompt !== undefined && <button type="button" disabled={running} onClick={() => patchRecipe({ prompt: undefined })}>恢复自动</button>}</div>}</div>}
        </div>
        <div className="mt-2 shrink-0 border-t pt-2" data-node-no-drag onMouseDown={stop} style={{ borderColor: theme.node.stroke }}>
            <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1"><ModelPicker className="!h-9 !gap-2 !rounded-xl !px-2.5 !text-xs" config={config} value={model} capability="image" groupByChannel="list" menuZoom={NODE_PANEL_WIDTH / NODE_PANEL_CONTENT_WIDTH} fullWidth disabled={running} ariaLabel="角色合成模型" onMissingConfig={() => useConfigStore.getState().openConfigDialog(true)} onChange={(value) => ctx.updateMetadata({ model: value })} /></div>
                <button type="button" disabled={!running && (preparing || !references.length)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold shadow-sm transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 disabled:opacity-40" style={{ backgroundImage: `linear-gradient(135deg, ${theme.accent.base}, color-mix(in srgb, ${theme.accent.base} 78%, ${theme.node.text}))`, color: theme.node.panel }} onClick={() => running ? generation.current?.abort() : void run()}>{running ? <Square size={13} /> : <Play size={13} />}{running ? "停止合成" : "立即合成"}</button>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px]" style={{ color: theme.node.muted }}>
                <label className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1" style={inset}>画面比例<select aria-label="角色合成画面比例" className="bg-transparent font-medium outline-none focus-visible:outline" style={{ color: theme.node.text }} value={ratio} disabled={running} onChange={(event) => setOutputSize(event.target.value, resolution)}>{outputRatios.map(({ value }) => <option style={{ background: theme.node.panel }} key={value}>{value}</option>)}</select></label>
                <label className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1" style={inset}>分辨率<select aria-label="角色合成分辨率" className="bg-transparent font-medium outline-none focus-visible:outline" style={{ color: theme.node.text }} value={resolution} disabled={running} onChange={(event) => setOutputSize(ratio, event.target.value)}>{outputResolutions.map((value) => <option style={{ background: theme.node.panel }} key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
                <span className="ml-auto truncate rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums" style={accent} title="请求尺寸，实际出图取决于所选模型">{outputSize.replace("x", " × ")}</span>
            </div>
            {(error || preparing || node.metadata?.errorDetails) && <p className="mt-1 truncate text-[10px]" role={error ? "alert" : "status"} title={error || node.metadata?.errorDetails}>{error || (preparing ? "正在准备参考图…" : node.metadata?.errorDetails)}</p>}
        </div>
        {picker && <CharacterRecipePickerModal initialSlot={picker} safe={safe} useDepth={Boolean(recipe.useDepth)} selection={recipe.slots} linked={recipeSlots.filter((slot) => !!linked[slot])} onSafeChange={setSafe} onDepthChange={(useDepth) => patchRecipe({ useDepth })} onPick={(slot, item) => { choose(slot, { kind: "gallery", item }); setPicker(undefined); }} onClose={() => setPicker(undefined)} />}
        {preview && <CharacterRecipePreviewModal {...preview} onClose={closePreview} afterClose={() => setPreview((current) => current?.open === false ? undefined : current)} onUse={preview.collage ? () => { patchRecipe({ useCollage: true }); closePreview(); } : undefined} />}
    </div>;
}

export const characterRecipeNodeDefinition: CanvasNodeDefinition = {
    type: CHARACTER_RECIPE_NODE_TYPE, title: characterRecipeTitle, description: characterRecipeDescription,
    icon: <Drama className="size-4" />, defaultSize: { width: 440, height: 460 }, defaultMetadata: { characterRecipe: {} },
    Content: CharacterRecipeNode, hidePanel: true,
};
