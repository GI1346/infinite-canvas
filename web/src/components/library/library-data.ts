import { nanoid } from "nanoid";
import { hydrateCanvasImages } from "@/lib/canvas/canvas-generation-helpers";
import { createCanvasNode, imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import type { Asset, TextAsset } from "@/stores/use-asset-store";
import { getImageBlob, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type Position } from "@/types/canvas";
import type { GalleryImage } from "@/pages/gallery/gallery-data";

export type SavedWorkflow = { nodes: CanvasNodeData[]; connections: CanvasConnection[] };
export function workflowOf(asset: Asset): SavedWorkflow | null {
    const value = asset.metadata?.workflow as SavedWorkflow | undefined;
    return asset.kind === "text" && asset.metadata?.resourceType === "workflow" && value && Array.isArray(value.nodes) && Array.isArray(value.connections) ? value : null;
}

export async function cloneWorkflow(workflow: SavedWorkflow, center: Position): Promise<SavedWorkflow> {
    if (!workflow.nodes.length) throw new Error("工作流没有节点");
    const ids = new Map(workflow.nodes.map((node) => [node.id, nanoid()]));
    const remap = (value: unknown): unknown => {
        if (typeof value === "string") return ids.get(value) || value.replace(/@\[node:([^\]]+)\]/g, (token, id: string) => ids.has(id) ? `@[node:${ids.get(id)}]` : token);
        if (Array.isArray(value)) return value.map(remap);
        if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [ids.get(key) || key, remap(item)]));
        return value;
    };
    const minX = Math.min(...workflow.nodes.map((node) => node.position.x)), minY = Math.min(...workflow.nodes.map((node) => node.position.y));
    const maxX = Math.max(...workflow.nodes.map((node) => node.position.x + node.width)), maxY = Math.max(...workflow.nodes.map((node) => node.position.y + node.height));
    const nodes = await hydrateCanvasImages(workflow.nodes.map((node) => ({ ...node, id: ids.get(node.id)!, position: { x: center.x + node.position.x - (minX + maxX) / 2, y: center.y + node.position.y - (minY + maxY) / 2 }, metadata: remap(node.metadata) as CanvasNodeData["metadata"] })));
    const connections = workflow.connections.filter((connection) => ids.has(connection.fromNodeId) && ids.has(connection.toNodeId)).map((connection) => ({ ...connection, id: nanoid(), fromNodeId: ids.get(connection.fromNodeId)!, toNodeId: ids.get(connection.toNodeId)! }));
    return { nodes, connections };
}

export async function insertLibraryItem(projectId: string, item: GalleryImage | TextAsset) {
    const project = useCanvasStore.getState().openProject(projectId);
    if (!project) throw new Error("画布不存在，请重新选择");
    const center = { x: (project.nodes.length ? Math.max(...project.nodes.map((node) => node.position.x + node.width)) : 0) + 320, y: 320 };
    const workflow = "kind" in item ? workflowOf(item) : null;
    let addition: SavedWorkflow;
    if (workflow) addition = await cloneWorkflow(workflow, center);
    else if ("kind" in item) addition = { nodes: [{ ...createCanvasNode(CanvasNodeType.Text, center, { content: item.data.content, status: "success" }), title: item.title }], connections: [] };
    else {
        const blob = item.storageKey ? await getImageBlob(item.storageKey) : null;
        const image = item.storageKey && blob ? { url: await resolveImageUrl(item.storageKey), storageKey: item.storageKey, width: item.width, height: item.height, bytes: blob.size, mimeType: blob.type } : await uploadImage(item.url);
        addition = { nodes: [{ ...createCanvasNode(CanvasNodeType.Image, center, imageMetadata(image)), title: item.title }], connections: [] };
    }
    const latest = useCanvasStore.getState().openProject(projectId);
    if (!latest) throw new Error("画布已删除");
    useCanvasStore.getState().updateProject(projectId, { nodes: [...latest.nodes, ...addition.nodes], connections: [...latest.connections, ...addition.connections] });
}
