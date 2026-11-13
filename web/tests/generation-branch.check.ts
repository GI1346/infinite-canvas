import assert from "node:assert/strict";
import { createGenerationBranch } from "../src/lib/canvas/canvas-generation-branch";
import { defaultConfig } from "../src/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

// 生成配置点"运行"时会派生一个新节点。规则：结果按 4 列网格向右排，
// 满 4 个换到下一排开头，不能像以前那样在同一个 x 上往下堆。
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
const result = (id: string, x: number, y = 100): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Image,
    title: id,
    position: { x, y },
    width: 300,
    height: 240,
    metadata: { content: `blob:${id}`, model: "test-image-model", generationType: "image" },
});
const branch = (nodes: CanvasNodeData[]) => createGenerationBranch(source, [source, ...nodes], [], config, "image", "cat")!;

const COLUMN_X = [496, 892, 1288, 1684];

const first = branch([]);
assert.deepEqual(first.node.position, { x: COLUMN_X[0], y: 100 }, "首个结果贴在源节点右侧");

const second = branch([first.node]);
assert.deepEqual(second.node.position, { x: COLUMN_X[1], y: 100 }, "第二个结果接在右边");

const third = branch([first.node, second.node]);
assert.deepEqual(third.node.position, { x: COLUMN_X[2], y: 100 }, "第三个继续向右");

const fourth = branch([first.node, second.node, third.node]);
assert.deepEqual(fourth.node.position, { x: COLUMN_X[3], y: 100 }, "第四个仍在第一排");

// 满 4 个后换排：回到第一列，落到第一排最底部下方 96。
const fifth = branch([first.node, second.node, third.node, fourth.node]);
assert.deepEqual(fifth.node.position, { x: COLUMN_X[0], y: 436 }, "第五个换到第二排开头");

const sixth = branch([first.node, second.node, third.node, fourth.node, fifth.node]);
assert.deepEqual(sixth.node.position, { x: COLUMN_X[1], y: 436 }, "第六个接在第二排第一个右边");

// 分组只是容器，不占用网格位置。
const group: CanvasNodeData = { id: "group", type: CanvasNodeType.Group, title: "组", position: { x: 496, y: 100 }, width: 300, height: 240, metadata: {} };
const withGroup = branch([first.node, group]);
assert.equal(withGroup.node.position.x, COLUMN_X[1], "分组节点不占用结果排队的位置");

// 用户把整排挪到别的高度后，新结果跟随这一排的 y，仍然按列向右。
const moved = branch([{ ...first.node, position: { x: COLUMN_X[0], y: 360 } }, { ...second.node, position: { x: COLUMN_X[1], y: 360 } }]);
assert.deepEqual(moved.node.position, { x: COLUMN_X[2], y: 360 }, "跟随该排实际 y");

// 派生节点保留提示词，但不会继承源节点的运行状态。
const branchNode = branch([first.node]).node;
assert.equal(branchNode.metadata?.status, "idle");
assert.equal(branchNode.metadata?.prompt, "cat");
assert.equal(branchNode.type, CanvasNodeType.Image);

console.log("PASS generation branch grid: 4 columns then wrap to the next row, groups ignored");
