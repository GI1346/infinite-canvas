import { useEffect, useRef, useState } from "react";
import { Dice5, Grid2X2, ImagePlus, Link2, Play, Plus, Shirt, Square, Upload, UserRound, PersonStanding, X, Drama } from "lucide-react";
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
const action = "inline-flex min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] transition hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40";
const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
const problem = (error: unknown) => error instanceof Error ? error.message : "操作失败，请重试。";
type Preview = { title: string; image?: string; error?: string; collage?: boolean };

function RecipeThumbnail({ reference }: { reference: RecipeReference }) {
    const [resolved, setResolved] = useState("");
    useEffect(() => {
        let active = true;
        setResolved("");
        if (reference.storageKey) void resolveImageUrl(reference.storageKey, reference.url).then((url) => { if (active) setResolved(url); }).catch(() => undefined);
        return () => { active = false; };
    }, [reference.storageKey, reference.url]);
    const src = reference.thumbnail || (reference.storageKey ? resolved : reference.url);
    return src ? <img className="h-full w-full object-cover" alt="" src={src} draggable={false} referrerPolicy="no-referrer" /> : <ImagePlus size={16} />;
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
    const [running, setRunning] = useState(false);
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

    const closePreview = () => { previewTask.current?.abort(); setPreview(undefined); };
    const showPreview = (ref?: RecipeReference) => {
        previewTask.current?.abort();
        const controller = new AbortController();
        previewTask.current = controller;
        const title = ref?.name || "三合一参考拼图";
        setPreview({ title, collage: !ref });
        void (async () => {
            try {
                if (ref && !ref.storageKey && ref.url) { setPreview({ title, image: ref.url }); return; }
                const images = await Promise.all((ref ? [ref] : references).map((input) => readRecipeImage(input, controller.signal)));
                const image = ref ? await readFileAsDataUrl(new File([images[0]], "reference", { type: images[0].type })) : await makeRecipeCollage(images, controller.signal);
                if (!controller.signal.aborted) setPreview({ title, image, collage: !ref });
            } catch (e) { if (!controller.signal.aborted) setPreview({ title, error: problem(e) }); }
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
        setRunning(true); setError("");
        ctx.updateMetadata({ status: "loading", errorDetails: undefined });
        try {
            const images = await Promise.all(selected.map((input) => readRecipeImage(input, signal)));
            const inputImages = state.useCollage ? [await makeRecipeCollage(images, signal)] : await Promise.all(images.map((image) => readFileAsDataUrl(new File([image], "reference", { type: image.type }))));
            signal.throwIfAborted();
            if (!isCurrent()) return;
            const result = await ctx.ai.generateImage(prompt, { model, references: inputImages, size: outputSize, resolution, count: getGenerationCount(config.canvasImageCount || config.count), waitForCompletion: true, signal });
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
            if (isCurrent()) setRunning(false);
        }
    };

    const busy = preparing || running;
    const control = { borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.text };
    return <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] p-3.5 text-xs" style={{ color: theme.node.text, background: theme.node.panel }}>
        <header className="mb-3 flex shrink-0 items-center gap-2"><span className="font-semibold">1. 参考图组合</span><span className="rounded-full px-2 py-0.5 text-[10px] tabular-nums" style={{ color: theme.toolbar.activeText, background: theme.toolbar.activeBg }}>{references.length} / 3</span><div className="ml-auto flex items-center gap-1" data-node-no-drag onMouseDown={stop}><button type="button" className={action} disabled={busy || recipeSlots.every((slot) => linked[slot])} onClick={() => randomize()}><Dice5 size={14} />随机</button><button type="button" className={action} aria-pressed={Boolean(recipe.useCollage)} disabled={busy || !references.length} onClick={() => showPreview()}><Grid2X2 size={14} />参考拼图</button></div></header>
        <fieldset disabled={busy} className="grid shrink-0 grid-cols-3 gap-2.5" data-node-no-drag onMouseDown={stop}>
            {recipeSlots.map((slot) => {
                const Icon = icons[slot], ref = references.find((item) => item.slot === slot), label = recipeSlotLabels[slot];
                return <div key={slot} className="flex min-w-0 flex-col justify-between gap-2 rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                    <div className="flex h-6 items-center justify-between gap-0.5"><span className="inline-flex shrink-0 items-center gap-0.5 font-medium" title={`${label}输入`}><Icon size={12} />{label}</span>{slot === "pose" && <RecipeDepthToggle value={Boolean(recipe.useDepth)} onChange={(useDepth) => patchRecipe({ useDepth })} />}</div>
                    {ref ? <div className="flex min-w-0 items-center gap-1.5"><button type="button" className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg disabled:opacity-50" style={{ background: theme.node.panel }} disabled={!ref.url && !ref.storageKey} title={`预览 ${ref.name}`} onClick={() => showPreview(ref)}><RecipeThumbnail reference={ref} /></button><div className="min-w-0 flex-1"><div title={ref.name} className="truncate font-medium">{ref.name}</div>{ref.linked ? <span className="mt-1 flex items-center gap-0.5 whitespace-nowrap text-[9px]" style={{ color: theme.toolbar.activeText }}><Link2 size={10} />上游连线</span> : <button type="button" className="mt-1 inline-flex items-center gap-0.5 text-[10px] opacity-70 hover:opacity-100" aria-label={`清除${label}`} onClick={() => choose(slot)}><X size={10} />清除</button>}</div></div> : <div className="flex h-12 items-center justify-between gap-0.5"><button type="button" className={`${action} flex-1 px-0`} onClick={() => setPicker(slot)}><Plus size={12} />选{label}</button><label className={`${action} cursor-pointer px-0`} title={`上传${label}`}><Upload size={11} /><span>上传</span><input type="file" accept="image/*" aria-label={`上传${label}`} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) upload(slot, file); }} /></label></div>}
                    <div className="flex items-center justify-between gap-0.5"><select aria-label={`${label}随机范围`} value={recipe.scopes?.[slot] || "similar"} disabled={Boolean(ref?.linked)} className="min-w-0 rounded-md border py-0.5 pl-0.5 text-[10px] disabled:opacity-40" style={control} onChange={(event) => patchRecipe({ scopes: { ...currentRecipe().scopes, [slot]: event.target.value === "all" ? "all" : "similar" } })}><option value="similar">同类</option><option value="all">全部</option></select><button type="button" className={`${action} px-0 text-[10px]`} disabled={Boolean(ref?.linked)} aria-label={`换一个${label}`} onClick={() => randomize(slot)}><Dice5 size={12} />换一个</button></div>
                </div>;
            })}
        </fieldset>
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5" data-node-no-drag onMouseDown={stop}>
            <div className="flex shrink-0 flex-wrap items-center gap-2"><span className="font-semibold">2. 合成提示词</span><select aria-label="画风" className="ml-auto rounded-md border px-1.5 py-1 text-[11px]" style={control} disabled={running} value={recipe.style || styles[0]} onChange={(event) => patchRecipe({ style: event.target.value })}>{styles.map((style) => <option key={style}>{style}</option>)}</select></div>
            <textarea aria-label="合成提示词" data-node-scroll className="min-h-0 w-full flex-1 resize-none select-text overscroll-contain rounded-xl border p-2 text-[11px] leading-relaxed outline-none" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} disabled={running} value={recipe.prompt ?? automaticPrompt(references, recipe)} onChange={(event) => patchRecipe({ prompt: event.target.value })} />
            <div className="flex shrink-0 items-center justify-between text-[10px]" style={{ color: theme.node.muted }}><span>{recipe.useCollage ? "已使用参考拼图" : "参考图按人像、服装、姿势顺序提交"}</span>{(recipe.prompt !== undefined || recipe.useCollage) && <div className="flex gap-2">{recipe.useCollage && <button type="button" disabled={running} onClick={() => patchRecipe({ useCollage: false })}>改用单图</button>}{recipe.prompt !== undefined && <button type="button" disabled={running} onClick={() => patchRecipe({ prompt: undefined })}>恢复自动</button>}</div>}</div>
        </div>
        <div className="mt-2 shrink-0 border-t pt-2" data-node-no-drag onMouseDown={stop} style={{ borderColor: theme.node.stroke }}>
            <div className="flex min-w-0 items-center gap-2"><div className="min-w-0 flex-1"><ModelPicker config={config} value={model} capability="image" groupByChannel="list" menuZoom={NODE_PANEL_WIDTH / NODE_PANEL_CONTENT_WIDTH} fullWidth disabled={running} ariaLabel="角色合成模型" onMissingConfig={() => useConfigStore.getState().openConfigDialog(true)} onChange={(value) => ctx.updateMetadata({ model: value })} /></div><button type="button" disabled={!running && (preparing || !references.length)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition hover:brightness-110 disabled:opacity-40" style={{ background: theme.accent.base, color: theme.node.panel }} onClick={() => running ? generation.current?.abort() : void run()}>{running ? <Square size={13} /> : <Play size={13} />}{running ? "停止合成" : "立即合成"}</button></div>
            <div className="mt-1.5 flex items-center gap-2 text-[10px]" style={{ color: theme.node.muted }}>
                <label className="inline-flex items-center gap-1.5">画面比例<select aria-label="角色合成画面比例" className="rounded-md border px-1.5 py-0.5" style={control} value={ratio} disabled={running} onChange={(event) => setOutputSize(event.target.value, resolution)}>{outputRatios.map(({ value }) => <option key={value}>{value}</option>)}</select></label>
                <label className="inline-flex items-center gap-1.5">分辨率<select aria-label="角色合成分辨率" className="rounded-md border px-1.5 py-0.5" style={control} value={resolution} disabled={running} onChange={(event) => setOutputSize(ratio, event.target.value)}>{outputResolutions.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
                <span className="ml-auto truncate tabular-nums" title="请求尺寸，实际出图取决于所选模型">{outputSize.replace("x", " × ")}</span>
            </div>
            {(error || running || preparing || node.metadata?.errorDetails) && <p className="mt-1 truncate text-[10px]" role={error ? "alert" : "status"} title={error || node.metadata?.errorDetails}>{error || (running ? "正在合成…" : preparing ? "正在准备参考图…" : node.metadata?.errorDetails)}</p>}
        </div>
        {picker && <CharacterRecipePickerModal initialSlot={picker} safe={safe} useDepth={Boolean(recipe.useDepth)} linked={recipeSlots.filter((slot) => !!linked[slot])} onSafeChange={setSafe} onDepthChange={(useDepth) => patchRecipe({ useDepth })} onPick={(slot, item) => { choose(slot, { kind: "gallery", item }); setPicker(undefined); }} onClose={() => setPicker(undefined)} />}
        {preview && <CharacterRecipePreviewModal {...preview} onClose={closePreview} onUse={preview.collage ? () => { patchRecipe({ useCollage: true }); closePreview(); } : undefined} />}
    </div>;
}

export const characterRecipeNodeDefinition: CanvasNodeDefinition = {
    type: CHARACTER_RECIPE_NODE_TYPE, title: characterRecipeTitle, description: characterRecipeDescription,
    icon: <Drama className="size-4" />, defaultSize: { width: 460, height: 390 }, defaultMetadata: { characterRecipe: {} },
    Content: CharacterRecipeNode, hidePanel: true,
};
