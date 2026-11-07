import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

export type SelectionLayout = "grid" | "row" | "column" | "flow";

// Move selected groups as units and preserve every child's relative position.
export function arrangeSelection(nodes: CanvasNodeData[], selected: Set<string>, mode: SelectionLayout, connections: CanvasConnection[] = []) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const ancestors = (node: CanvasNodeData) => {
        const ids: string[] = [], seen = new Set([node.id]);
        let parent = node.metadata?.groupId;
        while (parent && byId.has(parent) && !seen.has(parent)) {
            seen.add(parent); ids.push(parent); parent = byId.get(parent)?.metadata?.groupId;
        }
        return ids;
    };
    const roots = nodes.filter(node => selected.has(node.id) && !ancestors(node).some(id => selected.has(id)))
        .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    if (roots.length < 2 || (mode === "flow" && !nodes.some(node => selected.has(node.id) && node.type === CanvasNodeType.Config))) return nodes;
    const rootIds = new Set(roots.map(node => node.id));
    const owner = new Map(nodes.map(node => [node.id, [node.id, ...ancestors(node)].find(id => rootIds.has(id))]));
    let columns: CanvasNodeData[][];
    if (mode === "flow") {
        const outgoing = new Map(roots.map(node => [node.id, new Set<string>()])), indegree = new Map(roots.map(node => [node.id, 0]));
        for (const edge of connections) {
            const from = owner.get(edge.fromNodeId), to = owner.get(edge.toNodeId);
            if (from && to && from !== to && !outgoing.get(from)!.has(to)) {
                outgoing.get(from)!.add(to); indegree.set(to, indegree.get(to)! + 1);
            }
        }
        const depth = new Map(roots.map(node => [node.id, 0])), queue = roots.filter(node => indegree.get(node.id) === 0).map(node => node.id);
        for (let i = 0; i < queue.length; i++) for (const next of outgoing.get(queue[i])!) {
            depth.set(next, Math.max(depth.get(next)!, depth.get(queue[i])! + 1));
            indegree.set(next, indegree.get(next)! - 1);
            if (indegree.get(next) === 0) queue.push(next);
        }
        // Cycles stay together in one column; no recursive traversal or dropped nodes.
        columns = Array.from({ length: Math.max(...depth.values()) + 1 }, () => []);
        roots.forEach(node => columns[depth.get(node.id)!].push(node));
        columns = columns.filter(column => column.length);
    } else {
        const count = mode === "row" ? roots.length : mode === "column" ? 1 : Math.ceil(Math.sqrt(roots.length));
        columns = Array.from({ length: count }, (_, column) => roots.filter((_, i) => i % count === column));
    }
    const gapX = mode === "flow" ? 160 : 24, gapY = 68; // Includes the title above each node.
    const widths = columns.map(column => Math.max(...column.map(node => node.width)));
    const rowCount = Math.max(...columns.map(column => column.length));
    const heights = Array.from({ length: rowCount }, (_, row) => Math.max(...columns.flatMap(column => column[row] ? [column[row].height] : [])));
    const totalW = widths.reduce((sum, width) => sum + width, 0) + gapX * (columns.length - 1);
    const totalH = heights.reduce((sum, height) => sum + height, 0) + gapY * (heights.length - 1);
    const left = Math.min(...roots.map(node => node.position.x)), right = Math.max(...roots.map(node => node.position.x + node.width));
    const top = Math.min(...roots.map(node => node.position.y)), bottom = Math.max(...roots.map(node => node.position.y + node.height));
    const moves = new Map<string, { x: number; y: number }>();
    let x = (left + right - totalW) / 2;
    columns.forEach((column, c) => {
        let y = (top + bottom - totalH) / 2;
        column.forEach((node, r) => {
            moves.set(node.id, { x: Math.round(x + (widths[c] - node.width) / 2) - node.position.x, y: Math.round(y + (heights[r] - node.height) / 2) - node.position.y });
            y += heights[r] + gapY;
        });
        x += widths[c] + gapX;
    });
    return nodes.map(node => {
        const root = owner.get(node.id), delta = root ? moves.get(root) : undefined;
        return delta && (delta.x || delta.y) ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } } : node;
    });
}
