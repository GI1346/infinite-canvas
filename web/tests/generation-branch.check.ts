import assert from "node:assert/strict";
import { createGenerationBranch } from "../src/lib/canvas/canvas-generation-branch";
import { defaultConfig } from "../src/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

// 生成配置点"运行"时会派生一个新节点。规则：一个系列共 4 张图为一排（含生成节点里的首图），
// 满 4 张换到下一排开头；新节点贴在该排最右节点的右侧平行位置，保留上游配置与连线。
const config = { ...defaultConfig, model: "test-image-model", count: "1", size: "auto" };
const source: CanvasNodeData = {
    id: "source",
    type: CanvasNodeType.Image,
    title: "生成配置",
    position: { x: 100, y: 100 },
    width: 300,
    height: 240,
    metadata: { content: "blob:source", model: "test-image-model", prompt: "cat" },
};
const branch = (nodes: CanvasNodeData[], from: CanvasNodeData = source) => createGenerationBranch(from, [source, ...nodes], [], config, "image", "cat")!;
// 出图后节点才有 content；测试里补上，模拟"从已有结果再次运行"。
const withContent = (node: CanvasNodeData): CanvasNodeData => ({ ...node, metadata: { ...node.metadata, content: `blob:${node.id}` } });

const first = branch([]);
assert.deepEqual(first.node.position, { x: 496, y: 100 }, "首个结果贴在源节点右侧");
assert.equal(first.node.metadata?.generationOriginId, "source", "结果归属源节点系列");
assert.equal(first.node.metadata?.generationSlot, 1, "原始节点占第 1 槽，首个派生节点是第 2 槽");

const second = branch([first.node]);
assert.deepEqual(second.node.position, { x: 892, y: 100 }, "第二个结果接在右边");

const third = branch([first.node, second.node]);
assert.deepEqual(third.node.position, { x: 1288, y: 100 }, "第三个结果收尾第一排（含首图共 4 张）");

// 满 4 张后换排：回到第一列，落到第一排最底部下方 96。
const fourth = branch([first.node, second.node, third.node]);
assert.deepEqual(fourth.node.position, { x: 496, y: 436 }, "第五张图换到第二排开头");

const fifth = branch([first.node, second.node, third.node, fourth.node]);
assert.deepEqual(fifth.node.position, { x: 892, y: 436 }, "第六张图接在第二排第一个右边");

const sixth = branch([first.node, second.node, third.node, fourth.node, fifth.node]);
assert.deepEqual(sixth.node.position, { x: 1288, y: 436 }, "第七张图接在第二排第二个右边");

const seventh = branch([first.node, second.node, third.node, fourth.node, fifth.node, sixth.node]);
assert.deepEqual(seventh.node.position, { x: 1684, y: 436 }, "第八张图收尾第二排");

// 从链上最后一个结果再次运行，效果与从源节点运行一致：接到系列末尾。
const fromLatest = branch([first.node, second.node, third.node, fourth.node], withContent(fourth.node));
assert.deepEqual(fromLatest.node.position, { x: 892, y: 436 }, "从最新结果运行接在第二排第一个右边");
assert.equal(fromLatest.node.metadata?.generationOriginId, "source", "系列归属沿用原始节点");

// 从中间某个结果运行同样追加到系列末尾，不插队也不乱跑。
const fromMiddle = branch([first.node, second.node, third.node, fourth.node], withContent(second.node));
assert.deepEqual(fromMiddle.node.position, { x: 892, y: 436 }, "从中间结果运行接在第二排第一个右边");

// 分组只是容器，不占用网格位置。
const group: CanvasNodeData = { id: "group", type: CanvasNodeType.Group, title: "组", position: { x: 496, y: 100 }, width: 300, height: 240, metadata: {} };
const withGroup = branch([first.node, group]);
assert.equal(withGroup.node.position.x, 892, "分组节点不占用结果排队的位置");

// 用户把整排挪到别的高度后，新结果跟随该排最右节点的 y，仍然按列向右。
const moved = branch([{ ...first.node, position: { x: 496, y: 360 } }, { ...second.node, position: { x: 892, y: 360 } }]);
assert.deepEqual(moved.node.position, { x: 1288, y: 360 }, "跟随该排实际 y");

// 画布右侧的无关节点不参与系列计数；仅当真占住了格位时向右顺延一格，不会叠上去。
const unrelated: CanvasNodeData = { id: "other", type: CanvasNodeType.Image, title: "无关图", position: { x: 496, y: 100 }, width: 300, height: 240, metadata: { content: "blob:other" } };
const withUnrelated = branch([unrelated]);
assert.deepEqual(withUnrelated.node.position, { x: 892, y: 100 }, "被无关节点占位时向右顺延，不重叠");

// 派生节点保留提示词，但不会继承源节点的运行状态。
const branchNode = branch([first.node]).node;
assert.equal(branchNode.metadata?.status, "idle");
assert.equal(branchNode.metadata?.prompt, "cat");
assert.equal(branchNode.type, CanvasNodeType.Image);

console.log("PASS generation branch grid: origin counts as slot 1, 4 images per row then wrap, groups ignored");
