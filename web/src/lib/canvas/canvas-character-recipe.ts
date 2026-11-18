import { getImageBlob } from "@/services/image-storage";
import { withLocalProxy } from "@/stores/use-config-store";
import { getPoseImageUrl, getPoseThumbUrl, recipeSlotLabels, recipeSlots, resolveGalleryUrl, type CharacterRecipe, type RecipePromptInput, type RecipeSlot } from "@/services/api/pose-gallery";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ConnectionHandle, type Position } from "@/types/canvas";

export type RecipeReference = RecipePromptInput & { url: string; thumbnail: string; storageKey?: string; linked?: boolean; depth?: boolean };
const offsets = { portrait: -56, costume: 0, pose: 56 };
export const recipePortOffset = (port: RecipeSlot) => offsets[port];
export const isRecipePort = (port?: string): port is RecipeSlot => recipeSlots.some((slot) => slot === port);
export function recipeTargetAnchor(node: CanvasNodeData, port?: string) {
    return { x: node.position.x, y: node.position.y + node.height / 2 + (isRecipePort(port) ? recipePortOffset(port) : 0) };
}

export function recipeConnectionPort(target: CanvasNodeData, current: ConnectionHandle, world: Position, pointed: Element | null): RecipeSlot {
    if (current.handleType === "target" && isRecipePort(current.portId)) return current.portId;
    const handle = pointed?.closest<HTMLElement>("[data-recipe-port]");
    if (handle?.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId === target.id && isRecipePort(handle.dataset.recipePort)) return handle.dataset.recipePort;
    const relativeY = world.y - recipeTargetAnchor(target).y;
    return relativeY < offsets.portrait / 2 ? "portrait" : relativeY > offsets.pose / 2 ? "pose" : "costume";
}

export function recipeLinkedNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const linked: Partial<Record<RecipeSlot, CanvasNodeData>> = {};
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const edge of connections) {
        if (edge.toNodeId !== nodeId || !isRecipePort(edge.toPort)) continue;
        const source = byId.get(edge.fromNodeId);
        if (source?.type === CanvasNodeType.Image) linked[edge.toPort] = source;
    }
    return linked;
}

export function recipeReferences(recipe: CharacterRecipe, linked: ReturnType<typeof recipeLinkedNodes>) {
    return recipeSlots.flatMap((slot): RecipeReference[] => {
        const source = linked[slot];
        if (source) return [{ slot, name: source.title || recipeSlotLabels[slot], url: source.metadata?.content || "", storageKey: source.metadata?.storageKey, thumbnail: "", linked: true, depth: slot === "pose" && recipe.useDepth }];
        const selection = recipe.slots?.[slot];
        if (!selection) return [];
        if (selection.kind === "upload") return [{ slot, name: selection.name, storageKey: selection.storageKey, url: "", thumbnail: "", depth: slot === "pose" && recipe.useDepth }];
        const { item } = selection, depth = slot === "pose" && Boolean(recipe.useDepth);
        return [{ slot, name: item.name, angle: item.angle, depth, url: slot === "pose" ? getPoseImageUrl(item, depth) : resolveGalleryUrl(item.image), thumbnail: slot === "pose" ? getPoseThumbUrl(item, depth) : resolveGalleryUrl(item.thumbnail) }];
    });
}

export async function readRecipeImage(reference: RecipeReference, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (reference.storageKey) {
        const blob = await getImageBlob(reference.storageKey);
        if (blob) return blob;
    }
    if (!reference.url) throw new Error(`${recipeSlotLabels[reference.slot]}参考图还未就绪。`);
    try {
        const response = await fetch(withLocalProxy(reference.url), { signal, credentials: "omit" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error("不是图片");
        return blob;
    } catch (error) {
        signal?.throwIfAborted();
        throw new Error(`无法读取${recipeSlotLabels[reference.slot]}参考图，请检查图片来源或本地代理。`, { cause: error });
    }
}

export async function makeRecipeCollage(images: Blob[], signal?: AbortSignal) {
    const canvas = document.createElement("canvas");
    canvas.width = 1800; canvas.height = 1200;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建参考拼图");
    context.fillStyle = "#f6f4f0";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const panelWidth = canvas.width / images.length;
    await Promise.all(images.map(async (blob, index) => {
        const image = await createImageBitmap(blob);
        try {
            signal?.throwIfAborted();
            const scale = Math.min((panelWidth - 24) / image.width, (canvas.height - 24) / image.height);
            const width = image.width * scale, height = image.height * scale;
            context.drawImage(image, panelWidth * index + (panelWidth - width) / 2, (canvas.height - height) / 2, width, height);
        } finally { image.close(); }
    }));
    return canvas.toDataURL("image/png");
}
