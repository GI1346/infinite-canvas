import type { CanvasConnection, CanvasNodeData, Position } from "@/types/canvas";

export type SelectionAlignment = "left" | "center" | "right" | "top" | "middle" | "bottom";

// Move a selected group together with its descendants, preserving their offsets.
function selectionUnits(nodes: CanvasNodeData[], selected: Set<string>) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const ancestors = (node: CanvasNodeData) => {
        const ids: string[] = [], visited = new Set([node.id]);
        let parent = node.metadata?.groupId;
        while (parent && !visited.has(parent) && byId.has(parent)) {
            visited.add(parent); ids.push(parent); parent = byId.get(parent)?.metadata?.groupId;
        }
        return ids;
    };
    const roots = nodes.filter((node) => selected.has(node.id) && !ancestors(node).some((id) => selected.has(id)));
    const rootIds = new Set(roots.map((node) => node.id));
    const owners = new Map(nodes.map((node) => [node.id, [node.id, ...ancestors(node)].find((id) => rootIds.has(id))]));
    const move = (moves: Map<string, Position>) => nodes.map((node) => {
        const owner = owners.get(node.id), delta = owner ? moves.get(owner) : undefined;
        return delta && (delta.x || delta.y) ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } } : node;
    });
    return { roots, owners, move };
}

export function arrangeGrid(nodes: CanvasNodeData[], selected: Set<string>, columns: number, gap: number) {
    const { roots, move } = selectionUnits(nodes, selected);
    if (!roots.length) return nodes;
    columns = Math.max(1, Math.min(roots.length, Math.floor(columns) || 1)); gap = Math.max(0, gap);
    const startX = Math.min(...roots.map((node) => node.position.x)), startY = Math.min(...roots.map((node) => node.position.y));
    const widths = Array.from({ length: columns }, (_, c) => Math.max(...roots.filter((_, i) => i % columns === c).map((node) => node.width)));
    const heights = Array.from({ length: Math.ceil(roots.length / columns) }, (_, r) => Math.max(...roots.slice(r * columns, (r + 1) * columns).map((node) => node.height)));
    return move(new Map(roots.map((node, i) => [node.id, {
        x: startX + widths.slice(0, i % columns).reduce((a, b) => a + b + gap, 0) - node.position.x,
        y: startY + heights.slice(0, Math.floor(i / columns)).reduce((a, b) => a + b + gap + 28, 0) - node.position.y,
    }])));
}

export function arrangeSelectionAlignment(nodes: CanvasNodeData[], selected: Set<string>, alignment: SelectionAlignment) {
    const { roots, move } = selectionUnits(nodes, selected);
    if (roots.length < 2) return nodes;
    const left = Math.min(...roots.map((node) => node.position.x)), top = Math.min(...roots.map((node) => node.position.y));
    const right = Math.max(...roots.map((node) => node.position.x + node.width)), bottom = Math.max(...roots.map((node) => node.position.y + node.height));
    return move(new Map(roots.map((node) => [node.id, {
        x: alignment === "left" ? left - node.position.x : alignment === "center" ? (left + right - node.width) / 2 - node.position.x : alignment === "right" ? right - node.width - node.position.x : 0,
        y: alignment === "top" ? top - node.position.y : alignment === "middle" ? (top + bottom - node.height) / 2 - node.position.y : alignment === "bottom" ? bottom - node.height - node.position.y : 0,
    }])));
}

export function arrangeFlow(nodes: CanvasNodeData[], connections: CanvasConnection[], selected: Set<string>, gap = 80) {
    const { roots, owners, move } = selectionUnits(nodes, selected);
    if (roots.length < 2) return nodes;
    const ordered = [...roots].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    const next = new Map(roots.map((node) => [node.id, new Set<string>()]));
    const incoming = new Map(roots.map((node) => [node.id, 0])), rank = new Map(roots.map((node) => [node.id, 0]));
    for (const connection of connections) {
        const from = owners.get(connection.fromNodeId), to = owners.get(connection.toNodeId);
        if (!from || !to || from === to || next.get(from)!.has(to)) continue;
        next.get(from)!.add(to); incoming.set(to, incoming.get(to)! + 1);
    }
    const ready = ordered.filter((node) => incoming.get(node.id) === 0).map((node) => node.id), placed = new Set<string>();
    while (placed.size < roots.length) {
        // Cycles keep their edges and break at the leftmost unplaced node.
        const id = ready.shift() ?? [...ordered].filter((node) => !placed.has(node.id)).sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)[0].id;
        if (placed.has(id)) continue;
        placed.add(id);
        for (const target of next.get(id)!) {
            if (placed.has(target)) continue;
            rank.set(target, Math.max(rank.get(target)!, rank.get(id)! + 1));
            incoming.set(target, incoming.get(target)! - 1);
            if (incoming.get(target) === 0) ready.push(target);
        }
    }
    const columns = Array.from({ length: Math.max(...rank.values()) + 1 }, (_, index) => ordered.filter((node) => rank.get(node.id) === index));
    const heights = columns.map((column) => column.reduce((height, node) => height + node.height, 0) + Math.max(0, column.length - 1) * gap);
    const totalHeight = Math.max(...heights), startY = Math.min(...roots.map((node) => node.position.y));
    let x = Math.min(...roots.map((node) => node.position.x));
    const moves = new Map<string, Position>();
    columns.forEach((column, index) => {
        let y = startY + (totalHeight - heights[index]) / 2;
        column.forEach((node) => { moves.set(node.id, { x: x - node.position.x, y: y - node.position.y }); y += node.height + gap; });
        x += Math.max(...column.map((node) => node.width)) + gap;
    });
    return move(moves);
}