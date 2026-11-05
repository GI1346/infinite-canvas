import assert from "node:assert/strict";
import React, { act, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { CanvasNode } from "../src/components/canvas/canvas-node";
import { ConnectionPath } from "../src/components/canvas/canvas-connections";
import { registerNodeDefinitions, useNodeRegistryVersion } from "../src/lib/canvas/node-registry";
import { useNodeContentSnapshot } from "../src/pages/canvas/hooks/use-node-content-snapshot";
import { usePluginHost } from "../src/pages/canvas/hooks/use-plugin-host";
import { useAgentBridge } from "../src/pages/canvas/hooks/use-agent-bridge";
import { onCanvasEvent } from "../src/lib/canvas/canvas-event-bus";
import { useCanvasAssistantStore } from "../src/stores/use-canvas-assistant-store";
import { useConfigStore } from "../src/stores/use-config-store";
import { canvasThemes } from "../src/lib/canvas-theme";
import { CanvasNodeType, type CanvasNodeData, type CanvasConnection } from "../src/types/canvas";

const noop = () => {}, config = useConfigStore.getState().config, viewport = { x: 0, y: 0, k: 1 }, selected = new Set<string>();
let contentRenders = 0, graphChanges = 0, contentSnapshot: CanvasNodeData[] = [];
const Probe = React.memo(({ nodes }: { nodes: CanvasNodeData[] }) => { contentRenders++; return <span>{nodes[0]?.title}</span>; });
function Harness({ nodes, connections, dragging }: { nodes: CanvasNodeData[]; connections: CanvasConnection[]; dragging: boolean }) {
    const contentNodes = useNodeContentSnapshot(nodes, dragging);
    contentSnapshot = contentNodes;
    const nodesRef = useRef(nodes), connectionsRef = useRef(connections), viewportRef = useRef(viewport), selectedNodeIdsRef = useRef(selected), nodeDraggingRef = useRef(dragging), generateNodeRef = useRef(null), pluginHostRef = useRef(null);
    useLayoutEffect(() => { nodesRef.current = nodes; connectionsRef.current = connections; nodeDraggingRef.current = dragging; });
    usePluginHost({ contentNodes, nodeDraggingRef, effectiveConfig: config, isAiConfigReady: () => true, openConfigDialog: noop, theme: canvasThemes.light, nodesRef, connectionsRef, viewportRef, setNodes: noop, setDialogNodeId: noop, applyAgentOps: noop });
    useAgentBridge({ projectId: "drag-perf", title: "drag-perf", nodes, connections, selectedNodeIds: selected, viewport, isNodeDragging: dragging, getCanvasCenter: noop as any, nodesRef, connectionsRef, selectedNodeIdsRef, viewportRef, generateNodeRef, pluginHostRef, setNodes: noop, setConnections: noop, setSelectedNodeIds: noop, setSelectedConnectionId: noop, setViewport: noop, setContextMenu: noop });
    return <Probe nodes={contentNodes} />;
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => { if (String(url) === "/plugins/index.json") return new Response("[]"); throw Error(`Unexpected network: ${url}`); };
const el = document.createElement("div"); document.body.append(el);
const root = createRoot(el), unsubscribe = onCanvasEvent("canvas:graph-changed", () => graphChanges++);
let nodes: CanvasNodeData[] = [{ id: "text", type: "text", title: "source", position: { x: 0, y: 0 }, width: 100, height: 80, metadata: { content: "old" } }], connections: CanvasConnection[] = [];
const render = (dragging = true) => act(async () => { root.render(<Harness nodes={nodes} connections={connections} dragging={dragging} />); });
try {
    await render(false);
    const original = nodes;
    await render();
    for (let i = 1; i <= 60; i++) { nodes = nodes.map(node => ({ ...node, position: { x: i, y: i * 2 } })); await render(); }
    assert.equal(contentSnapshot, original); assert.equal(contentRenders, 1); assert.equal(graphChanges, 0);
    assert.equal(useCanvasAssistantStore.getState().context?.snapshot.nodes, original);
    assert.equal(useCanvasAssistantStore.getState().context?.getSnapshot?.().nodes, nodes);
    console.log("PASS 60 position updates: 1 content render, 0 redundant graph events; assistant tool reads live coordinates");
    nodes = nodes.map(node => ({ ...node, metadata: { content: "new" } })); await render();
    assert.equal(contentSnapshot, nodes); assert.equal(contentRenders, 2); assert.equal(graphChanges, 1);
    connections = [{ id: "edge", fromNodeId: "text", toNodeId: "table" }]; await render(); assert.equal(graphChanges, 2);
    console.log("PASS actual content and connection changes still notify during a drag");
    nodes = nodes.map(node => ({ ...node, position: { x: 90, y: 100 } })); await render(); assert.equal(graphChanges, 2);
    await render(false); assert.equal(contentSnapshot, nodes, "Released snapshot must contain final coordinates for sidebar export"); assert.equal(graphChanges, 3); assert.equal(useCanvasAssistantStore.getState().context?.snapshot.nodes, nodes);
    console.log("PASS release publishes final graph positions and assistant snapshot");
    for (const patch of [{ title: "renamed" }, { width: 150 }, { height: 160 }, { type: "image" }]) { nodes = nodes.map(node => ({ ...node, ...patch })); await render(false); assert.equal(contentSnapshot, nodes); }
    nodes = [...nodes, { ...nodes[0], id: "second" }]; await render(false); assert.equal(contentSnapshot, nodes);
    nodes = nodes.slice(1); await render(false); assert.equal(contentSnapshot, nodes);
    console.log("PASS rename, resize, type changes, addition and removal invalidate content snapshot");
    let references: any;
    function ProjectReferences({ picker }: { picker: string | null }) { references = useProjectDragReferences(nodes, connections, picker); return null; }
    nodes = [
        { id: "group", type: "group", title: "group", position: { x: 0, y: 0 }, width: 400, height: 300 },
        { id: "child", type: "image", title: "image", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { groupId: "group", content: "data:image/png;base64,AA==" } },
    ];
    connections = [{ id: "reference", fromNodeId: "group", toNodeId: "config" }];
    await act(async () => root.render(<ProjectReferences picker="config" />));
    const stableReferences = references;
    assert.ok(references.referenceConnectedNodeIds.has("child"));
    for (let i = 0; i < 60; i++) {
        nodes = nodes.map(node => ({ ...node, position: { x: i, y: i } }));
        await act(async () => root.render(<ProjectReferences picker="config" />));
        for (const key of Object.keys(stableReferences).filter(key => key !== "visibleConnections")) assert.equal(references[key], stableReferences[key], `Page ${key} changed on a position-only frame`);
    }
    nodes = [...nodes, { ...nodes[1], id: "new-child" }];
    await act(async () => root.render(<ProjectReferences picker="config" />));
    assert.ok(references.referenceConnectedNodeIds.has("new-child"));
    await act(async () => root.render(<ProjectReferences picker={null} />));
    assert.equal(references.referenceConnectedNodeIds.size, 0);
    console.log("PASS actual page callbacks remain stable through 60 frames; group content and picker changes still refresh");
    let stationaryReads = 0, picked = "", contextId = "";
    const fixedFrom = { ...nodes[1], id: "fixed", get width() { stationaryReads++; return 100; } };
    const fixedTo = { ...nodes[1], id: "target", position: { x: 400, y: 0 } };
    const fixedEdge = { id: "fixed-edge", fromNodeId: "fixed", toNodeId: "target" }, movingEdge = { id: "moving-edge", fromNodeId: "moving", toNodeId: "target" };
    const pick = (id: string) => { picked = id; }, context = (_event: React.MouseEvent, id: string) => { contextId = id; };
    function VisibleEdges({ frameNodes }: { frameNodes: CanvasNodeData[] }) {
        const page = useProjectDragReferences(frameNodes, [fixedEdge, movingEdge], null);
        return <svg>{page.visibleConnections.map(({ connection, from, to }) => <ConnectionPath key={connection.id} connection={connection} from={from} to={to} active={false} onSelect={pick} onContextMenu={context} />)}</svg>;
    }
    const renderEdges = (x: number) => act(async () => root.render(<VisibleEdges frameNodes={[fixedFrom, fixedTo, { ...nodes[1], id: "moving", position: { x, y: 0 } }]} />));
    await renderEdges(0); const firstPath = el.querySelector('[data-connection-id="moving-edge"]')!.getAttribute("d");
    for (let i = 1; i <= 60; i++) await renderEdges(i);
    assert.equal(stationaryReads, 2, "Stationary edge must compute bounds once and path once across all moving frames");
    assert.notEqual(el.querySelector('[data-connection-id="moving-edge"]')!.getAttribute("d"), firstPath);
    await act(async () => el.querySelector('[data-connection-id="fixed-edge"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => el.querySelector('[data-connection-id="fixed-edge"]')!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })));
    assert.equal(picked, "fixed-edge"); assert.equal(contextId, "fixed-edge");
    console.log("PASS actual page culling + paths over 60 frames: stationary edge bounds/path calculate once each; attached edge follows; clicks retain correct ID");
    let innerRenders = 0;
    registerNodeDefinitions([{ type: "perf:node", title: "perf", icon: null, defaultSize: { width: 100, height: 80 }, hidePanel: true, Content: ({ ctx }) => { innerRenders++; return <span data-perf-position>{ctx.node.position.x}:{ctx.node.metadata?.content}</span>; } }]);
    nodes = [{ ...nodes[0], type: "perf:node", position: { x: 0, y: 0 } }];
    const pluginHost: any = { getNodes: () => nodes, getNode: () => nodes[0], getConnections: () => connections, getUpstream: () => [], getDownstream: () => [], ai: {}, updateMetadata: noop, updateNode: noop, applyOps: noop, openPanel: noop, closePanel: noop };
    const props: any = { scale: 1, isSelected: true, isRelated: false, isFocusRelated: false, isConnectionTarget: false, isConnecting: false, showPanel: false, showImageInfo: false, mentionReferences: [], pluginHost, onMouseDown: noop, onHoverStart: noop, onHoverEnd: noop, onConnectStart: noop, onResizeStart: noop, onResize: noop, onResizeEnd: noop, onContentChange: noop, onTitleChange: noop, onContextMenu: noop };
    const renderNode = (isDragging: boolean) => act(async () => root.render(<CanvasNode {...props} data={nodes[0]} isDragging={isDragging} registryVersion={useNodeRegistryVersion.getState().version} />));
    await renderNode(false); await renderNode(true); const before = innerRenders;
    for (let i = 1; i <= 60; i++) { nodes = [{ ...nodes[0], position: { x: i, y: i } }]; await renderNode(true); }
    assert.equal(innerRenders, before); assert.match(el.querySelector("[data-node-id]")!.getAttribute("style")!, /translate3d\(60px, 60px, 0\)/);
    nodes = [{ ...nodes[0], metadata: { content: "live change" } }]; await renderNode(true); assert.equal(innerRenders, before + 1); assert.match(el.textContent!, /live change/);
    nodes = [{ ...nodes[0], position: { x: 100, y: 100 } }]; await renderNode(true); await renderNode(false);
    assert.equal(el.querySelector("[data-perf-position]")!.textContent, "100:live change");
    console.log("PASS real CanvasNode: 60 moving frames reuse complex content; shell moves, live edits refresh, release supplies final coordinates");
    registerNodeDefinitions([{ type: "perf:node", title: "updated", icon: null, defaultSize: { width: 100, height: 80 }, hidePanel: true, Content: () => <span data-late-plugin>registered</span> }]);
    await renderNode(false); assert.equal(el.querySelector("[data-late-plugin]")?.textContent, "registered");
    console.log("PASS late plugin registration invalidates cached content");
} finally { unsubscribe(); await act(async () => root.unmount()); el.remove(); globalThis.fetch = originalFetch; }