import localforage from "localforage";

import { withLocalProxy } from "@/stores/use-config-store";

export const GALLERY_ORIGIN = "https://ai-pose-gallery.anhao.app";
export const recipeSlots = ["portrait", "costume", "pose"] as const;
export type RecipeSlot = (typeof recipeSlots)[number];
export const recipeSlotLabels: Record<RecipeSlot, string> = { portrait: "人像", costume: "服装", pose: "姿势" };
export type GalleryItem = {
    id: string;
    name: string;
    thumbnail: string;
    image: string;
    category: string;
    group: string;
    source: string;
    angle: string;
    search: string;
    sensitive: boolean;
};
export type RecipeSelection = { kind: "gallery"; item: GalleryItem } | { kind: "upload"; name: string; storageKey: string };
export type RecipeScope = "similar" | "all";
export type CharacterRecipe = {
    slots?: Partial<Record<RecipeSlot, RecipeSelection>>;
    scopes?: Partial<Record<RecipeSlot, RecipeScope>>;
    useDepth?: boolean;
    style?: string;
    prompt?: string;
    useCollage?: boolean;
};
export type GalleryData = Record<RecipeSlot, GalleryItem[]>;

const cacheKey = "blinkflow:pose-gallery-cache-v1";
const galleryLoads: Partial<Record<RecipeSlot, Promise<GalleryItem[]>>> = {};
let cachedIndexes: Promise<Partial<GalleryData>> | undefined;

export function resolveGalleryUrl(path: string) {
    if (!path) return "";
    return /^(https?:\/\/|data:|blob:)/i.test(path) ? path : `${GALLERY_ORIGIN}/${path.replace(/^\/+/, "")}`;
}

function poseVariant(path: string, useDepth: boolean) {
    const relative = path.replace(/^\/+/, "");
    if (!useDepth || !/^(thumbs|img)\/(?!depth\/)/.test(relative)) return resolveGalleryUrl(path);
    return resolveGalleryUrl(relative.replace(/^(thumbs|img)\//, "$1/depth/").replace(/\.(jpe?g|png)$/i, ".webp"));
}

export const getPoseThumbUrl = (pose: GalleryItem, useDepth = false) => poseVariant(pose.thumbnail, useDepth);
export const getPoseImageUrl = (pose: GalleryItem, useDepth = false) => poseVariant(pose.image || pose.thumbnail, useDepth);

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const sensitiveCategory = /全身单人[・·]性感系|内衣[・·]睡衣|性感穿搭|泳装[・·]度假/u;
function normalizeItem(slot: RecipeSlot, value: unknown): GalleryItem[] {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const id = text(row.id), thumbnail = text(row.缩略图), image = text(row.原图) || text(row.预览图) || thumbnail;
    if (!id || !thumbnail) return [];
    const name = text(row[slot === "portrait" ? "标题" : slot === "costume" ? "服装名称" : "姿势名称"]) || text(row.发型名称) || id;
    const group = slot === "portrait" ? text(row.分区) : slot === "pose" ? text(row.体系) : text(row.一级分类) || (row.source ? "二次元" : "现实");
    const category = text(slot === "portrait" ? row.发长 : row.分类);
    const angle = text(row.角度), source = text(row.source) || "gallery";
    return [{ id, name, thumbnail, image, group, category, angle, source, search: [name, group, category, angle, text(row.检索), text(row.关键词)].join(" ").toLowerCase(), sensitive: row.敏感 === true || sensitiveCategory.test(`${group} ${category}`) }];
}

async function readIndex(slot: RecipeSlot, name: string) {
    const url = `${GALLERY_ORIGIN}/data/${name}.json`;
    const requestUrl = withLocalProxy(url);
    let rows: unknown;
    try {
        const response = await fetch(requestUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        rows = await response.json();
    } catch {
        throw new Error(requestUrl === url ? "无法读取远程图库。请开启 BlinkFlow 的本地代理，或在桌面版中重试。" : "图库暂时无法读取，请检查网络和本地代理后重试。");
    }
    if (!Array.isArray(rows)) throw new Error("图库索引格式无效，请稍后重试。");
    return rows.flatMap((item) => normalizeItem(slot, item));
}

const indexNames: Record<RecipeSlot, string[]> = {
    portrait: ["portrait-zh"], pose: ["pose-zh"],
    costume: ["costume-zh", "costume-anime-zh", "costume-gia-anime-zh", "costume-shisei-zh"],
};

export function loadPoseGallerySlot(slot: RecipeSlot) {
    return galleryLoads[slot] ??= (async () => {
        const cache = await (cachedIndexes ??= localforage.getItem<Partial<GalleryData>>(cacheKey).then<Partial<GalleryData>, Partial<GalleryData>>((value) => value ?? {}, () => ({})));
        const stored = cache[slot];
        if (Array.isArray(stored) && stored.length) return stored;
        const groups = await Promise.all(indexNames[slot].map((name) => readIndex(slot, name)));
        const items = groups.flat();
        cache[slot] = items;
        void localforage.setItem(cacheKey, { ...cache }).catch(() => undefined);
        return items;
    })().catch((error: unknown) => { delete galleryLoads[slot]; throw error; });
}

export async function loadPoseGalleryData(): Promise<GalleryData> {
    const [portrait, costume, pose] = await Promise.all(recipeSlots.map(loadPoseGallerySlot));
    return { portrait, costume, pose };
}

export function randomizeSlotItem(slot: RecipeSlot, items: GalleryItem[], current?: GalleryItem, scope: RecipeScope = "similar", safe = true) {
    const pool = items.filter((item) => (!safe || !item.sensitive) && item.id !== current?.id && (scope === "all" || !current ||
        (item.group === current.group && item.category === current.category && (slot !== "costume" || item.source === current.source))));
    return pool[Math.floor(Math.random() * pool.length)];
}

export type RecipePromptInput = { slot: RecipeSlot; name: string; angle?: string };
export function buildCharacterRecipePrompt(inputs: RecipePromptInput[], style: string, useDepth = false, useCollage = false) {
    const position = (index: number) => useCollage ? `参考拼图的第${index + 1}栏` : `图${index + 1}`;
    const lines = inputs.map(({ slot, name, angle }, index) => {
        const reference = `${position(index)}（${recipeSlotLabels[slot]}：${name}${angle ? `，${angle}` : ""}）`;
        if (slot === "portrait") return `以${reference}为准保留人物五官、脸型与发型。`;
        if (slot === "costume") return `按${reference}还原衣服的版型、配色、材质和配饰。`;
        return `遵循${reference}的${useDepth ? "身体姿势、空间深度" : "身体姿势、肢体轮廓"}与镜头视角。`;
    });
    return ["将参考合成为同一个完整且自然的角色画面。", ...lines, `画风：${style}。`, "画面中没有任何文字、标志或水印。"].join("\n");
}
