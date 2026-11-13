import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

/**
 * 图片节点是否挂「生成配置」面板。
 * 空图片节点就是待生成的生成节点；已经出图的看是否带生成参数，
 * 纯上传的图片只有 content，不弹配置窗。
 */
export function showsGenerationPanel(node: CanvasNodeData) {
    if (node.type !== CanvasNodeType.Image) return false;
    const meta = node.metadata || {};
    if (!meta.content) return true;
    return Boolean(meta.generationType || meta.model || meta.prompt || meta.size || meta.quality || meta.count);
}

/**
 * 面板是否展开。规则（按需求）：
 * - 单点选中的是生成节点 / 结果图 → 展开
 * - 选中 2 个及以上 → 收起
 * - 其他节点（文本、表格、LLM、并发、视频、音频…）单击一律不弹
 * - 插件自己调用 openPanel（dialogNodeId 指向该节点）时允许
 * - 拖拽、缩放、框选期间收起
 */
export function shouldShowNodePanel(node: CanvasNodeData, state: { selected: boolean; selectedCount: number; dialogNodeId: string | null; blocked: boolean }) {
    if (state.blocked) return false;
    if (state.selected && state.selectedCount === 1 && showsGenerationPanel(node)) return true;
    return Boolean(getNodeDefinition(node.type)?.Panel) && state.dialogNodeId === node.id;
}
