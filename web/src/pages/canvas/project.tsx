import { createGenerationBranch } from "@/lib/canvas/canvas-generation-branch";
import { enlargeWorkflowNodes } from "@/lib/canvas/workflow-display-size";
import { isCanvasNodeVisible } from "@/lib/canvas/canvas-visibility";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Group, Video } from "lucide-react";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { requestAudioGeneration, storeGeneratedAudio } from "@/services/api/audio";
import { createVideoGenerationTask, isVideoTaskFailed, storeGeneratedVideo, waitForVideoGenerationTask } from "@/services/api/video";
import { defaultConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { ensureImagePreview, getImageBlob, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { nanoid } from "nanoid";
import { getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { canWriteClipboardImage, writeClipboard, writeClipboardText } from "@/lib/clipboard";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useAssetStore } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { cropDataUrl, splitDataUrl, upscaleDataUrl } from "@/lib/canvas/canvas-image-data";
import { fitNodeSize, generatedImageNodeSize, nodeSizeFromRatio } from "@/lib/canvas/canvas-node-size";
import { captureVideoFrame, type VideoFramePosition } from "@/lib/canvas/canvas-video-frame";
import { App, Button, Modal } from "antd";
import { NODE_DEFAULT_SIZE, getNodeSpec } from "@/constant/canvas";
import { ActiveConnectionPath, ConnectionPath, connectionDragNodeIds } from "@/components/canvas/canvas-connections";
import { ConnectionCutEffects, useConnectionCutter } from "@/components/canvas/use-connection-cutter";
import { tableConnectionPort } from "@/lib/canvas/canvas-table-port";
import { connectionCutHistory } from "@/lib/canvas/canvas-connection-cut-history";
import { cloneDragSelection, expandDragNodeIds } from "@/lib/canvas/canvas-drag-copy";
import { connectionCurve, curvePath } from "@/lib/canvas/canvas-connection-geometry";
import { CanvasConfigComposer } from "@/components/canvas/canvas-config-composer";
import { CanvasConfigNodePanel } from "@/components/canvas/canvas-config-node-panel";
import { CanvasNodeContextMenu } from "@/components/canvas/canvas-context-menu";
import { CanvasNodeAngleDialog, type CanvasImageAngleParams } from "@/components/canvas/canvas-node-angle-dialog";
import { CanvasExtractSelectionDialog } from "@/components/canvas/canvas-extract-selection-dialog";
import { extractImageSelection, imageOutputCropContext } from "@/lib/canvas/canvas-local-fusion";
import { fusionConnectionPort } from "@/lib/canvas/canvas-fusion-ports";
import { isLocalFusionRunning } from "@/lib/canvas/canvas-local-fusion-run";
import { CanvasNodePaintDialog } from "@/components/canvas/canvas-node-paint-dialog";
import { CanvasImagePreviewDialog } from "@/components/canvas/canvas-image-preview-dialog";
import { CanvasNodeCropDialog, type CanvasImageCropRect } from "@/components/canvas/canvas-node-crop-dialog";
import { CanvasNodeMaskEditDialog, type CanvasImageMaskEditPayload } from "@/components/canvas/canvas-node-mask-edit-dialog";
import { CanvasNodeSplitDialog, type CanvasImageSplitParams } from "@/components/canvas/canvas-node-split-dialog";
import { CanvasNodeUpscaleDialog, type CanvasImageUpscaleParams } from "@/components/canvas/canvas-node-upscale-dialog";
import { buildNodeGenerationContext, buildNodeGenerationInputs, buildNodeResponseMessages, hydrateNodeGenerationContext, type NodeGenerationInput } from "@/components/canvas/canvas-node-generation";
import { CanvasGroupColorToolbar, CanvasNodeHoverToolbar, CanvasNodeInfoModal } from "@/components/canvas/canvas-node-hover-toolbar";
import { collectDownloadImages } from "@/lib/canvas/canvas-batch-download";
import { CanvasSelectionToolbar } from "@/components/canvas/canvas-selection-toolbar";
import { InfiniteCanvas } from "@/components/canvas/infinite-canvas";
import { Minimap } from "@/components/canvas/canvas-mini-map";
import { CanvasNode } from "@/components/canvas/canvas-node";
import { CanvasNodePromptPanel, type CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import { CanvasToolbar } from "@/components/canvas/canvas-toolbar";
import { cloneWorkflow, type SavedWorkflow } from "@/components/library/library-data";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { CanvasSidePanel } from "@/components/canvas/canvas-side-panel";
import { CanvasZoomControls } from "@/components/canvas/canvas-zoom-controls";
import { useCanvasAssistantStore } from "@/stores/use-canvas-assistant-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAgentBridge } from "@/pages/canvas/hooks/use-agent-bridge";
import { usePluginHost } from "@/pages/canvas/hooks/use-plugin-host";
import { useNodeContentSnapshot } from "@/pages/canvas/hooks/use-node-content-snapshot";
import { buildNodeMentionReferences, getGroupResourceNodes, isCanvasReferenceNode, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { applyNodeConfigPatch, audioMetadata, buildAudioGenerationMetadata, buildImageGenerationMetadata, createCanvasNode, imageMetadata, videoMetadata } from "@/lib/canvas/canvas-node-factory";
import { applyGroupSelection, applyUngroupSelection, canGroupSelectedNodes, canUngroupSelectedNodes, collectGroupMemberNodes, findContainingGroupId, findGroupDropTarget, focusViewportForNode, getConnectionTargetAnchor, getGroupWrapRect, normalizeConnection, snapNodesIntoGroup } from "@/lib/canvas/canvas-node-geometry";
import {
    audioExtension,
    buildAngleLabel,
    buildAnglePrompt,
    buildGenerationConfig,
    findRetrySourceNode,
    generationReferenceUrls,
    getGenerationCount,
    getInputSummary,
    hasResumableVideoTask,
    hydrateAssistantImages,
    hydrateCanvasImages,
    imageExtension,
    isAudioFile,
    isGenerationCanceled,
    resetInterruptedGeneration,
    resolveMetadataReferences,
    sourceNodeReferenceImages,
} from "@/lib/canvas/canvas-generation-helpers";
import { getNodeDefinition, isBuiltinNodeType as isBuiltinType, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { registerBuiltinNodes } from "@/components/canvas/nodes/builtin-nodes";
import { CanvasPluginManagerModal } from "@/components/canvas/canvas-plugin-manager-modal";
import { CanvasRefreshShell } from "@/components/canvas/canvas-refresh-shell";
import { CanvasTopBar } from "@/components/canvas/canvas-top-bar";
import { arrangeGrid } from "@/lib/canvas/canvas-grid-layout";
import { arrangeSelection } from "@/lib/canvas/canvas-selection-layout";
import { canvasDownloadMimeType, canvasDownloadName } from "@/lib/canvas/canvas-download-name";
import { useCanvasImageDownload } from "@/hooks/use-canvas-image-download";
import { recordDiagnostic } from "@/services/diagnostics";
import { CanvasCleanupModal } from "@/components/canvas/canvas-cleanup-modal";
import { runningTableBatches } from "@/lib/canvas/dxos-table";
import { ConnectionCreateMenu, NodeCreateMenu, type PendingConnectionCreate } from "@/components/canvas/canvas-create-menus";
import {
    CanvasNodeType,
    type CanvasAssistantImage,
    type CanvasAssistantSession,
    type CanvasConnection,
    type CanvasNodeData,
    type CanvasNodeImage,
    type CanvasNodeText,
    type CanvasNodeMetadata,
    type CanvasNodeTypeId,
    type ConnectionHandle,
    type ContextMenuState,
    type Position,
    type SelectionBox,
    type ViewportTransform,
} from "@/types/canvas";
import type { CanvasPluginHost } from "@/types/canvas-plugin";
import type { ReferenceImage } from "@/types/image";
import type { GalleryImage } from "@/pages/gallery/gallery-data";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

// Register built-in nodes in the shared registry once when the module loads.
registerBuiltinNodes();

const CANVAS_IMAGE_CLIPBOARD_TYPE = "application/x-blinkflow-canvas-images";

/** 有文字选区且不在画布内容层时，Ctrl+C 应该走系统复制，不抢节点复制。 */
function selectionBlocksCanvasCopy() {
    const selection = window.getSelection();
    if (!selection?.toString()) return false;
    const anchor = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement || null;
    return !anchor?.closest("[data-canvas-world]");
}

/** 从 text/html 里取第一张图片地址；只接受能直接读取的协议。 */
function clipboardImageSource(html: string) {
    if (!html) return "";
    const match = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(html);
    const source = match?.[1]?.trim() || "";
    return /^(?:data:image\/|https?:\/\/|blob:)/i.test(source) ? source : "";
}

type CanvasClipboard = {
    token: string;
    /** 写进系统剪贴板的纯文本；粘贴时用它判断这份剪贴板是不是本程序刚复制的。 */
    text: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

type ConnectionDropTarget = {
    nodeId: string | null;
    isNearNode: boolean;
};

type CanvasHistoryEntry = Pick<CanvasClipboard, "nodes" | "connections"> & {
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};

type CanvasGenerationProject = { id: string; alive: boolean };

type CanvasGenerationRequest = {
    targetNodeId: string;
    originNodeId: string;
    runningNodeId: string;
    controller: AbortController;
    project: CanvasGenerationProject;
};

function guardGenerationSetter<T>(setter: Dispatch<SetStateAction<T>>, active: () => boolean): Dispatch<SetStateAction<T>> {
    return (next) => {
        if (!active()) return;
        // React may evaluate the updater after navigation or a replacement run has started.
        setter((previous) => active() ? typeof next === "function" ? (next as (value: T) => T)(previous) : next : previous);
    };
}
const VIDEO_NODE_MAX_WIDTH = 420;
const VIDEO_NODE_MAX_HEIGHT = 420;
// Stable empty reference array prevents `... || []` from invalidating CanvasNode's React.memo on every render.
const EMPTY_REFERENCES: CanvasResourceReference[] = [];
const CONNECTION_HANDLE_HIT_RADIUS = 40;
const CONNECTION_NODE_HIT_PADDING = 32;
const NODE_STATUS_IDLE = "idle" as const;
const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;

function applyGeneratedVideo(item: CanvasNodeData, video: UploadedFile, extra: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    const videoSize = fitNodeSize(video.width || item.width, video.height || item.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
    return {
        ...item,
        width: videoSize.width,
        height: videoSize.height,
        position: { x: item.position.x + item.width / 2 - videoSize.width / 2, y: item.position.y + item.height / 2 - videoSize.height / 2 },
        metadata: { ...item.metadata, ...videoMetadata(video), ...extra },
    };
}

export default function CanvasPage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    return <InfiniteCanvasPage />;
}

function measureFocusFrame(container: HTMLDivElement | null, nodeId: string) {
    if (!container) return {};
    const nodeRect = container.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`)?.getBoundingClientRect();
    const panelRect = container.querySelector<HTMLElement>(`[data-node-id="${nodeId}"] [data-node-panel]`)?.getBoundingClientRect();
    const toolbarRect = document.querySelector<HTMLElement>(`[data-node-toolbar="${nodeId}"]`)?.getBoundingClientRect();
    const dockRect = document.querySelector<HTMLElement>("[data-canvas-bottom-toolbar]")?.getBoundingClientRect();
    const below = nodeRect && panelRect ? panelRect.bottom - nodeRect.bottom : 0;
    const above = nodeRect && toolbarRect ? nodeRect.top - toolbarRect.top : 0;
    return { above, below, bottomInset: dockRect && below > 0 ? Math.max(0, container.getBoundingClientRect().bottom - dockRect.top) : 0 };
}

function InfiniteCanvasPage() {
    const { message, modal } = App.useApp();
    const { downloading: batchDownloading, downloadImages, downloadImage } = useCanvasImageDownload();
    const { t } = useTranslation();
    // Subscribe to the registry version so plugin registration changes rerender the canvas.
    const nodeRegistryVersion = useNodeRegistryVersion((state) => state.version);
    const params = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const projectId = params.id || "";
    const containerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position } | null>(null);
    const clipboardRef = useRef<CanvasClipboard | null>(null);
    const historyRef = useRef<{ past: CanvasHistoryEntry[]; future: CanvasHistoryEntry[] }>({ past: [], future: [] });
    const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const applyingHistoryRef = useRef(false);
    const historyPausedRef = useRef(false);
    const rafRef = useRef<number | null>(null);
    const dragPointerRef = useRef({ x: 0, y: 0 });
    const nodeDraggingRef = useRef(false);
    const dragPaintRef = useRef<{ nodes: HTMLElement[]; edges: Array<{ connection: CanvasConnection; paths: SVGPathElement[] }>; groupId: string | null }>({ nodes: [], edges: [], groupId: null });
    const dragRef = useRef<{
        isDraggingNode: boolean;
        hasMoved: boolean;
        startX: number;
        startY: number;
        // Keyed by node id so drag frames look positions up in O(1) instead of scanning the array per node.
        initialSelectedNodes: Map<string, { x: number; y: number }>;
        movedIds: Set<string>;
        copyRequested: boolean;
        originalSelection: Set<string>;
        beforeCopy: CanvasHistoryEntry | null;
    }>({
        isDraggingNode: false,
        hasMoved: false,
        startX: 0,
        startY: 0,
        initialSelectedNodes: new Map(),
        movedIds: new Set(),
        copyRequested: false,
        originalSelection: new Set(),
        beforeCopy: null,
    });

    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const hydrationError = useCanvasStore((state) => state.hydrationError);
    const createProject = useCanvasStore((state) => state.createProject);
    const openProject = useCanvasStore((state) => state.openProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const currentProject = useCanvasStore((state) => state.projects.find((project) => project.id === projectId));
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [canvasTool, setCanvasTool] = useState<"select" | "pan">("select");
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [connectingParams, setConnectingParams] = useState<ConnectionHandle | null>(null);
    const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(null);
    const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate | null>(null);
    const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [nodeCreatePosition, setNodeCreatePosition] = useState<Position | null>(null);
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("lines");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
    const projectLoaded = loadedProjectId === projectId;
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [pluginManagerOpen, setPluginManagerOpen] = useState(false);
    const [cleanupOpen, setCleanupOpen] = useState(false);
    const [paintNodeId, setPaintNodeId] = useState<string | null>(null);
    const [extractNodeId, setExtractNodeId] = useState<string | null>(null);
    const [cropNodeId, setCropNodeId] = useState<string | null>(null);
    const [maskEditNodeId, setMaskEditNodeId] = useState<string | null>(null);
    const [splitNodeId, setSplitNodeId] = useState<string | null>(null);
    const [upscaleNodeId, setUpscaleNodeId] = useState<string | null>(null);
    const [superResolveNodeId, setSuperResolveNodeId] = useState<string | null>(null);
    const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [previewImageId, setPreviewImageId] = useState<string | null>(null);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
    const [expandedBatchNodeIds, setExpandedBatchNodeIds] = useState<Set<string>>(new Set());
    const [isNodeDragging, setIsNodeDragging] = useState(false);
    const [isNodeResizing, setIsNodeResizing] = useState(false);
    const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
    const [referencePickerNodeId, setReferencePickerNodeId] = useState<string | null>(null);

    const nodesRef = useRef(nodes);
    const connectionsRef = useRef(connections);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const viewportRef = useRef(viewport);
    const focusAnimRef = useRef<number | null>(null);
    const pluginHostRef = useRef<CanvasPluginHost | null>(null);
    const generateNodeRef = useRef<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string, signal?: AbortSignal) => Promise<string | void>) | null>(null);
    const connectingParamsRef = useRef(connectingParams);
    const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
    const selectionBoxRef = useRef(selectionBox);
    const pendingConnectionCreateRef = useRef(pendingConnectionCreate);
    const generationRequestsRef = useRef(new Map<string, CanvasGenerationRequest>());
    const videoPollIdsRef = useRef(new Map<string, CanvasGenerationProject>());
    const generationOwnersRef = useRef(new Map<string, CanvasGenerationRequest>());
    const generationProjectRef = useRef<CanvasGenerationProject>({ id: projectId, alive: true });
    if (generationProjectRef.current.id !== projectId) generationProjectRef.current = { id: projectId, alive: true };
    useEffect(() => {
        const project = generationProjectRef.current;
        project.alive = true;
        return () => {
            project.alive = false;
            // Only navigation/unmount cancels native requests; viewport culling must not.
            generationRequestsRef.current.forEach((request, id) => {
                if (request.project !== project) return;
                request.controller.abort();
                if (generationRequestsRef.current.get(id) === request) generationRequestsRef.current.delete(id);
            });
            generationOwnersRef.current.forEach((request, id) => { if (request.project === project) generationOwnersRef.current.delete(id); });
            videoPollIdsRef.current.forEach((owner, id) => { if (owner === project) videoPollIdsRef.current.delete(id); });
        };
    }, [projectId]);

    const createHistoryEntry = useCallback(
        (): CanvasHistoryEntry => ({
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            chatSessions,
            activeChatId,
            backgroundMode,
            showImageInfo,
        }),
        [activeChatId, backgroundMode, chatSessions, showImageInfo],
    );

    const commitConnectionCut = useCallback((ids: Set<string>) => {
        const result = connectionCutHistory(createHistoryEntry(), lastHistoryRef.current, historyRef.current.past, ids);
        if (!result) return;
        if (historyCommitTimerRef.current) { clearTimeout(historyCommitTimerRef.current); historyCommitTimerRef.current = null; }
        historyRef.current = { past: result.past, future: result.future };
        lastHistoryRef.current = result.current;
        connectionsRef.current = result.current.connections;
        setConnections(result.current.connections);
        setSelectedConnectionId((selected) => selected && ids.has(selected) ? null : selected);
        setHistoryState({ canUndo: true, canRedo: false }); setContextMenu(null);
    }, [createHistoryEntry]);
    const connectionCutter = useConnectionCutter({ containerRef, nodes, connections, viewport, onCommit: commitConnectionCut });

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown) => {
            cleanupAssetImages({ extra, history: historyRef.current, lastHistory: lastHistoryRef.current });
        },
        [cleanupAssetImages],
    );

    const startGenerationRequest = useCallback((targetNodeId: string, originNodeId: string, runningId = originNodeId, controller = new AbortController()) => {
        const previous = generationRequestsRef.current.get(targetNodeId);
        if (previous?.controller !== controller) previous?.controller.abort();
        const request = { targetNodeId, originNodeId, runningNodeId: runningId, controller, project: generationProjectRef.current };
        generationRequestsRef.current.set(targetNodeId, request);
        generationOwnersRef.current.set(targetNodeId, request);
        return controller;
    }, []);

    const finishGenerationRequest = useCallback((targetNodeId: string, controller: AbortController) => {
        const request = generationRequestsRef.current.get(targetNodeId);
        if (request?.controller === controller) generationRequestsRef.current.delete(targetNodeId);
    }, []);

    const completeVideoNodeTask = useCallback(
        async (nodeId: string, config: Parameters<typeof buildGenerationConfig>[0], prompt: string, images: Parameters<typeof createVideoGenerationTask>[2], signal: AbortSignal, extra: CanvasNodeData["metadata"] = {}, videos: ReferenceVideo[] = [], audios: ReferenceAudio[] = []) => {
            const project = generationProjectRef.current, owner = generationOwnersRef.current.get(nodeId);
            const active = () => !signal.aborted && project.alive && generationProjectRef.current === project && generationOwnersRef.current.get(nodeId) === owner;
            const assertActive = () => { if (!active()) throw new DOMException("生成已停止或画布已切换", "AbortError"); };
            const updateNodes = guardGenerationSetter(setNodes, active);
            assertActive();
            const task = await createVideoGenerationTask(config, prompt, images, { signal, videos, audios });
            assertActive();
            updateNodes((prev) => prev.map((item) => (item.id === nodeId ? { ...item, metadata: { ...item.metadata, videoTaskId: task.id, videoTaskProvider: task.provider === "gemini" ? "gemini" : "openai", model: config.model } } : item)));
            const result = await waitForVideoGenerationTask(config, task, { signal });
            assertActive();
            const video = await storeGeneratedVideo(result);
            assertActive();
            updateNodes((prev) => prev.map((item) => (item.id === nodeId ? applyGeneratedVideo(item, video, { prompt, model: config.model, ...extra }) : item)));
        },
        [],
    );

    const pollVideoNodeTask = useCallback(
        async (node: CanvasNodeData, silent = false) => {
            const project = generationProjectRef.current;
            const taskId = node.metadata?.videoTaskId;
            if (!taskId || node.metadata?.content || generationRequestsRef.current.has(node.id) || videoPollIdsRef.current.has(node.id)) return;
            videoPollIdsRef.current.set(node.id, project);
            let controller: AbortController | undefined;
            const active = () => project.alive && generationProjectRef.current === project && (!controller || (!controller.signal.aborted && generationOwnersRef.current.get(node.id)?.controller === controller));
            const updateNodes = guardGenerationSetter(setNodes, active);
            const updateRunningNodeId = guardGenerationSetter(setRunningNodeId, active);
            try {
                const generationConfig = buildGenerationConfig(effectiveConfig, node, "video");
                if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                    if (silent) {
                        updateNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: t("workbench.configFirst") } } : item)));
                        return;
                    }
                    openConfigDialog(true);
                    return;
                }
                controller = startGenerationRequest(node.id, node.id, node.id);
                updateRunningNodeId(node.id);
                updateNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : item)));
                const result = await waitForVideoGenerationTask(generationConfig, { id: taskId, provider: node.metadata?.videoTaskProvider === "gemini" ? "gemini" : "openai", model: generationConfig.model }, { signal: controller.signal });
                if (!active()) return;
                const video = await storeGeneratedVideo(result);
                if (!active()) return;
                updateNodes((prev) =>
                    prev.map((item) =>
                        item.id === node.id
                            ? applyGeneratedVideo(item, video, {
                                  prompt: item.metadata?.prompt,
                                  model: generationConfig.model,
                                  size: generationConfig.size,
                                  seconds: generationConfig.videoSeconds,
                                  vquality: generationConfig.vquality,
                                  generateAudio: generationConfig.videoGenerateAudio,
                                  watermark: generationConfig.videoWatermark,
                                  videoMode: generationConfig.videoMode,
                              })
                            : item,
                    ),
                );
            } catch (error) {
                if (!active() || isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
                recordDiagnostic("画布任务", error, { projectId });
                message.error(errorDetails);
                updateNodes((prev) =>
                    prev.map((item) =>
                        item.id === node.id
                            ? {
                                  ...item,
                                  metadata: {
                                      ...item.metadata,
                                      status: item.metadata?.content ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR,
                                      errorDetails: item.metadata?.content ? undefined : errorDetails,
                                      ...(isVideoTaskFailed(error) ? { videoTaskId: undefined } : {}),
                                  },
                              }
                            : item,
                    ),
                );
            } finally {
                if (videoPollIdsRef.current.get(node.id) === project) videoPollIdsRef.current.delete(node.id);
                if (controller) {
                    updateRunningNodeId((current) => (current === node.id ? null : current));
                    finishGenerationRequest(node.id, controller);
                }
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest, t],
    );
    const stopGenerationByRunningId = useCallback((runningId: string) => {
        const affectedNodeIds = new Set<string>();
        generationRequestsRef.current.forEach((request) => {
            if (request.runningNodeId !== runningId) return;
            request.controller.abort();
            generationRequestsRef.current.delete(request.targetNodeId);
            affectedNodeIds.add(request.targetNodeId);
            affectedNodeIds.add(request.originNodeId);
        });
        setRunningNodeId((current) => (current === runningId ? null : current));
        if (!affectedNodeIds.size) return;
        setNodes((prev) =>
            prev.map((node) =>
                affectedNodeIds.has(node.id) && node.metadata?.status === NODE_STATUS_LOADING
                    ? {
                          ...node,
                          metadata: {
                              ...node.metadata,
                              status: NODE_STATUS_IDLE,
                              errorDetails: undefined,
                              images: node.metadata.images?.map((image) => (image.status === NODE_STATUS_LOADING ? { ...image, status: NODE_STATUS_ERROR, errorDetails: t("common.requestCanceled") } : image)),
                              texts: node.metadata.texts?.map((text) => (text.status === NODE_STATUS_LOADING ? { ...text, status: NODE_STATUS_ERROR, errorDetails: t("common.requestCanceled") } : text)),
                          },
                      }
                    : node,
            ),
        );
    }, [t]);

    const confirmStopGeneration = useCallback(
        (nodeId: string) => {
            modal.confirm({
                title: t("canvas.projectPage.stopTitle"),
                content: t("canvas.projectPage.stopDescription"),
                okText: t("canvas.projectPage.stop"),
                cancelText: t("canvas.projectPage.continue"),
                okButtonProps: { danger: true },
                onOk: () => stopGenerationByRunningId(nodeId),
            });
        },
        [modal, stopGenerationByRunningId, t],
    );

    useEffect(() => {
        if (!hydrated) return;
        setLoadedProjectId(null);
        const project = openProject(projectId);
        if (!project) {
            navigate("/canvas", { replace: true });
            return;
        }

        let canceled = false;
        const restore = async () => {
            const restoredNodes = await hydrateCanvasImages(resetInterruptedGeneration(enlargeWorkflowNodes(project.nodes)));
            if (canceled) return;
            const restoredSessions = await hydrateAssistantImages(project.chatSessions || []);
            if (canceled) return;
            setNodes(restoredNodes);
            setConnections(project.connections);
            setChatSessions(restoredSessions);
            setActiveChatId(project.activeChatId || null);
            setBackgroundMode(project.backgroundMode);
            setShowImageInfo(project.showImageInfo || false);
            setViewport(project.viewport);
            historyRef.current = { past: [], future: [] };
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
            lastHistoryRef.current = {
                nodes: restoredNodes,
                connections: project.connections,
                chatSessions: restoredSessions,
                activeChatId: project.activeChatId || null,
                backgroundMode: project.backgroundMode,
                showImageInfo: project.showImageInfo || false,
            };
            setHistoryState({ canUndo: false, canRedo: false });
            setLoadedProjectId(projectId);
        };
        void restore();
        return () => { canceled = true; };
    }, [hydrated, navigate, openProject, projectId]);

    useEffect(() => {
        if (!projectLoaded) return;
        nodesRef.current.filter(hasResumableVideoTask).forEach((node) => void pollVideoNodeTask(node, true));
        // Resume once after the current canvas is restored, not on later config identity changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectLoaded]);


    useEffect(() => {
        if (!projectLoaded || applyingHistoryRef.current || historyPausedRef.current) return;
        const next = createHistoryEntry();
        const previous = lastHistoryRef.current;
        if (
            previous?.nodes === next.nodes &&
            previous.connections === next.connections &&
            previous.chatSessions === next.chatSessions &&
            previous.activeChatId === next.activeChatId &&
            previous.backgroundMode === next.backgroundMode &&
            previous.showImageInfo === next.showImageInfo
        )
            return;

        if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = setTimeout(() => {
            const current = createHistoryEntry();
            const last = lastHistoryRef.current;
            if (!last) return;
            historyRef.current.past = [...historyRef.current.past.slice(-49), last];
            historyRef.current.future = [];
            setHistoryState({ canUndo: true, canRedo: false });
            lastHistoryRef.current = current;
            historyCommitTimerRef.current = null;
        }, 180);

        return () => {
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
        };
    }, [activeChatId, backgroundMode, chatSessions, connections, createHistoryEntry, nodes, projectLoaded, showImageInfo]);

    useEffect(() => {
        if (!projectLoaded || historyPausedRef.current) return;
        updateProject(projectId, { nodes, connections, chatSessions, activeChatId, backgroundMode, showImageInfo });
    }, [activeChatId, backgroundMode, chatSessions, connections, nodes, projectId, projectLoaded, showImageInfo, updateProject]);

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useEffect(() => {
        if (!projectLoaded) return;
        if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        viewportSaveTimerRef.current = setTimeout(() => {
            updateProject(projectId, { viewport: viewportRef.current });
            viewportSaveTimerRef.current = null;
        }, 500);
        return () => {
            if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        };
    }, [projectId, projectLoaded, updateProject, viewport]);

    // As with viewport panning, move only the affected DOM in each animation frame.
    // Keep live coordinates for tools; commit React state once the gesture ends.
    const paintNodeDrag = useCallback(() => {
        const drag = dragRef.current;
        if (!drag.isDraggingNode || !drag.hasMoved) return;
        const dx = (dragPointerRef.current.x - drag.startX) / viewportRef.current.k;
        const dy = (dragPointerRef.current.y - drag.startY) / viewportRef.current.k;
        nodesRef.current = nodesRef.current.map((node) => {
            const initial = drag.initialSelectedNodes.get(node.id);
            if (!initial || (node.position.x === initial.x + dx && node.position.y === initial.y + dy)) return node;
            return { ...node, position: { x: initial.x + dx, y: initial.y + dy } };
        });
        const byId = new Map(nodesRef.current.map((node) => [node.id, node]));
        for (const element of dragPaintRef.current.nodes) {
            const node = byId.get(element.dataset.nodeId!);
            if (node && element.hasAttribute("data-text-node")) { element.style.left = `${node.position.x}px`; element.style.top = `${node.position.y}px`; }
            else if (node) element.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0)`;
        }
        for (const { connection, paths } of dragPaintRef.current.edges) {
            const from = byId.get(connection.fromNodeId), to = byId.get(connection.toNodeId);
            if (!from || !to) continue;
            const d = curvePath(connectionCurve(connection, from, to));
            paths.forEach((path) => path.setAttribute("d", d));
        }
    }, []);

    useLayoutEffect(() => {
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        selectedNodeIdsRef.current = selectedNodeIds;
        viewportRef.current = viewport;
        connectingParamsRef.current = connectingParams;
        connectionTargetNodeIdRef.current = connectionTargetNodeId;
        pendingConnectionCreateRef.current = pendingConnectionCreate;
        if (dragRef.current.isDraggingNode) {
            const moved = dragRef.current.movedIds, root = containerRef.current;
            const edges = new Map(connections.filter((edge) => moved.has(edge.fromNodeId) || moved.has(edge.toNodeId)).map((edge) => [edge.id, edge]));
            dragPaintRef.current.nodes = Array.from(root?.querySelectorAll<HTMLElement>("[data-node-id]") || []).filter((element) => moved.has(element.dataset.nodeId!));
            dragPaintRef.current.edges = Array.from(root?.querySelectorAll<SVGGElement>("[data-connection-paths]") || []).flatMap((group) => {
                const connection = edges.get(group.dataset.connectionPaths!);
                return connection ? [{ connection, paths: Array.from(group.querySelectorAll<SVGPathElement>("path")) }] : [];
            });
            // A generation result or new connection can commit during a drag; preserve its content and repaint at the live pointer before the browser paints.
            paintNodeDrag();
        }
    }, [nodes, connections, selectedNodeIds, viewport, connectingParams, connectionTargetNodeId, pendingConnectionCreate, isNodeDragging, paintNodeDrag]);

    useLayoutEffect(() => {
        selectionBoxRef.current = selectionBox;
    }, [selectionBox]);

    useEffect(() => {
        if (!projectLoaded) return;
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, [projectLoaded]);

    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const currentViewport = viewportRef.current;
        const localX = clientX - (rect?.left || 0);
        const localY = clientY - (rect?.top || 0);

        return {
            x: (localX - currentViewport.x) / currentViewport.k,
            y: (localY - currentViewport.y) / currentViewport.k,
        };
    }, []);

    const getCanvasCenter = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return screenToCanvas((rect?.left || 0) + (rect?.width || size.width) / 2, (rect?.top || 0) + (rect?.height || size.height) / 2);
    }, [screenToCanvas, size.height, size.width]);

    const setConnecting = useCallback((next: ConnectionHandle | null) => {
        connectingParamsRef.current = next;
        setConnectingParams(next);
        if (!next) {
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
        }
    }, []);

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen || !selectedNodeIdsRef.current.has(nodeId)) return;
            setToolbarNodeId(nodeId);
        },
        [nodeImageSettingsOpen],
    );

    const hideNodeToolbar = useCallback(() => {}, []);

    const connectNodes = useCallback(
        (current: ConnectionHandle, targetNodeId: string, clientX: number, clientY: number) => {
            const sourceIds = connectionDragNodeIds(current);
            if (sourceIds.includes(targetNodeId)) return;
            const world = screenToCanvas(clientX, clientY);
            const pointedElement = document.elementFromPoint(clientX, clientY);
            const additions = sourceIds.flatMap((nodeId): CanvasConnection[] => {
                const connection = normalizeConnection(nodeId, targetNodeId, nodesRef.current, current.handleType);
                if (!connection) return [];
                const target = nodesRef.current.find((node) => node.id === connection.toNodeId);
                const toPort = target ? tableConnectionPort(target, current, world, pointedElement) || fusionConnectionPort(target, current, world, pointedElement) : undefined;
                return [{ id: nanoid(), ...connection, ...(toPort ? { toPort } : {}) }];
            });
            if (!additions.length) {
                message.warning(t("canvas.projectPage.configConnection"));
                return;
            }
            setConnections((prev) => [...prev, ...additions.filter((next) => !prev.some((conn) => conn.fromNodeId === next.fromNodeId && conn.toNodeId === next.toNodeId && conn.toPort === next.toPort))]);
            setContextMenu(null);
        },
        [message, screenToCanvas, t],
    );

    const createConnectedNode = useCallback(
        (type: string, pending: PendingConnectionCreate) => {
            const metadata = type === CanvasNodeType.Config ? { model: effectiveConfig.imageModel || effectiveConfig.model, size: effectiveConfig.size, count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count) } : undefined;
            const newNode = createCanvasNode(type, pending.position, metadata);
            newNode.position.x = pending.position.x - (pending.connection.handleType === "target" ? newNode.width : 0);
            const graph = [...nodesRef.current, newNode];
            const additions = connectionDragNodeIds(pending.connection).flatMap((nodeId): CanvasConnection[] => {
                const connection = normalizeConnection(nodeId, newNode.id, graph, pending.connection.handleType);
                if (!connection) return [];
                const toPort = connection.toNodeId === newNode.id && newNode.type === "dxos:table" ? "input-1" : pending.connection.handleType === "target" ? pending.connection.portId : undefined;
                return [{ id: nanoid(), ...connection, ...(pending.connection.handleType === "target" ? { fromNodeId: newNode.id, toNodeId: nodeId } : {}), ...(toPort ? { toPort } : {}) }];
            });
            if (!additions.length) {
                message.warning(t("canvas.projectPage.configConnection"));
                return;
            }
            setNodes((prev) => [...prev, newNode]);
            setConnections((prev) => [...prev, ...additions]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            if (getNodeDefinition(type)?.Panel) setDialogNodeId(newNode.id);
            setPendingConnectionCreate(null);
            setConnecting(null);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message, setConnecting, t],
    );

    const cancelPendingConnectionCreate = useCallback(() => {
        setPendingConnectionCreate(null);
        setConnecting(null);
    }, [setConnecting]);

    const getConnectionDropTarget = useCallback(
        (clientX: number, clientY: number, current: ConnectionHandle): ConnectionDropTarget => {
            const world = screenToCanvas(clientX, clientY);
            const sourceIds = connectionDragNodeIds(current);
            const scale = Math.max(viewportRef.current.k, 0.05);
            const padding = CONNECTION_NODE_HIT_PADDING / scale;
            const handleRadius = CONNECTION_HANDLE_HIT_RADIUS / scale;
            let isNearNode = false;
            let bestNodeId: string | null = null;
            let bestPriority = Number.POSITIVE_INFINITY;

            [...nodesRef.current]
                .reverse()
                .forEach((node) => {
                    const anchor = getConnectionTargetAnchor(node, current, world);
                    if (node.type === "dxos:table" && current.handleType === "source") {
                        const channels = node.metadata?.tableInputChannels || [{ id: "input-1" }, { id: "input-2" }];
                        const offset = Math.max(0, Math.min(channels.length - 1, Math.round((world.y - anchor.y) / 56 + (channels.length - 1) / 2)));
                        anchor.y += (offset - (channels.length - 1) / 2) * 56;
                    }
                    const dx = world.x - anchor.x;
                    const dy = world.y - anchor.y;
                    const hitsHandle = dx * dx + dy * dy <= handleRadius * handleRadius;
                    const hitsInside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height;
                    const hitsExpanded = world.x >= node.position.x - padding && world.x <= node.position.x + node.width + padding && world.y >= node.position.y - padding && world.y <= node.position.y + node.height + padding;

                    if (!hitsHandle && !hitsInside && !hitsExpanded) return;
                    isNearNode = true;
                    if (sourceIds.includes(node.id) || !sourceIds.some((sourceId) => normalizeConnection(sourceId, node.id, nodesRef.current, current.handleType))) return;

                    const priority = hitsInside ? 0 : hitsHandle ? 1 : 2;
                    if (priority < bestPriority) {
                        bestNodeId = node.id;
                        bestPriority = priority;
                    }
                });

            return { nodeId: bestNodeId, isNearNode };
        },
        [screenToCanvas],
    );

    const cullLeft = Math.floor(-viewport.x / viewport.k / 512) * 512;
    const cullTop = Math.floor(-viewport.y / viewport.k / 512) * 512;
    const viewBounds = useMemo(() => {
        const padding = 280;
        const width = size.width;
        const height = size.height;
        const left = cullLeft - padding;
        const top = cullTop - padding;
        return { left, top, right: left + width / viewport.k + padding * 2 + 512, bottom: top + height / viewport.k + padding * 2 + 512 };
        // Quantized overscan avoids remounting image/workflow nodes on every pan frame.
    }, [size.height, size.width, viewport.k, cullLeft, cullTop]);

    const visibleNodes = useMemo(
        () => nodes.filter((node) => (isNodeDragging && dragRef.current.movedIds.has(node.id)) || isCanvasNodeVisible(node, viewBounds)),
        [nodes, viewBounds, isNodeDragging],
    );

    const contentNodes = useNodeContentSnapshot(nodes, isNodeDragging);
    const contentNodeById = useMemo(() => new Map(contentNodes.map((node) => [node.id, node])), [contentNodes]);
    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

    // A cubic stays inside its control-point hull, including every table input port.
    // Reuse stationary edge bounds; only edges touching a changed node need geometry work.
    const connectionBoundsCache = useRef(new WeakMap<CanvasConnection, { from: CanvasNodeData; to: CanvasNodeData; left: number; top: number; right: number; bottom: number }>());
    const visibleConnections = useMemo(
        () =>
            connections.flatMap((connection) => {
                const from = nodeById.get(connection.fromNodeId);
                const to = nodeById.get(connection.toNodeId);
                if (!from || !to) return [];
                let bounds = connectionBoundsCache.current.get(connection);
                if (!bounds || bounds.from !== from || bounds.to !== to) {
                    const curve = connectionCurve(connection, from, to), xs = curve.map((point) => point.x), ys = curve.map((point) => point.y);
                    bounds = { from, to, left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
                    connectionBoundsCache.current.set(connection, bounds);
                }
                const inView = (isNodeDragging && (dragRef.current.movedIds.has(from.id) || dragRef.current.movedIds.has(to.id))) || (bounds.right >= viewBounds.left && bounds.left <= viewBounds.right && bounds.bottom >= viewBounds.top && bounds.top <= viewBounds.bottom);
                return inView ? [{ connection, from, to }] : [];
            }),
        [connections, nodeById, viewBounds, isNodeDragging],
    );
    // The toolbar follows a single selected node selected by click, creation, marquee, or keyboard.
    // It stays hidden for multi-selection and while isNodeDragging is true.
    const singleSelectedNodeId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
    const toolbarNode = (toolbarNodeId ? nodeById.get(toolbarNodeId) || null : null) || (singleSelectedNodeId ? nodeById.get(singleSelectedNodeId) || null : null);
    const infoNode = infoNodeId ? nodeById.get(infoNodeId) || null : null;
    const paintNode = paintNodeId ? nodeById.get(paintNodeId) || null : null;
    const extractNode = extractNodeId ? nodeById.get(extractNodeId) || null : null;
    const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
    const maskEditNode = maskEditNodeId ? nodeById.get(maskEditNodeId) || null : null;
    const splitNode = splitNodeId ? nodeById.get(splitNodeId) || null : null;
    const upscaleNode = upscaleNodeId ? nodeById.get(upscaleNodeId) || null : null;
    const superResolveNode = superResolveNodeId ? nodeById.get(superResolveNodeId) || null : null;
    const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
    const contextMenuNode = contextMenu?.type === "node" ? nodeById.get(contextMenu.nodeId) || null : null;
    const previewNode = previewNodeId ? nodeById.get(previewNodeId) || null : null;
    const previewContent = previewImageId ? previewNode?.metadata?.images?.find((image) => image.id === previewImageId)?.content : previewNode?.metadata?.content;
    const previewImages = useMemo(() => contentNodes.filter((node) => node.type === CanvasNodeType.Image).flatMap((node) => {
        const images = node.metadata?.images?.filter((image) => image.content) || [];
        return images.length ? images.map((image) => ({ id: node.id + ":" + image.id, nodeId: node.id, imageId: image.id, content: image.content, title: node.title })) : node.metadata?.content ? [{ id: node.id, nodeId: node.id, imageId: "", content: node.metadata.content, title: node.title }] : [];
    }), [contentNodes]);
    const previewIndex = previewImages.findIndex((image) => image.nodeId === previewNodeId && (previewImageId ? image.imageId === previewImageId : image.content === previewContent));
    const navigatePreview = (offset: number) => {
        if (!previewImages.length) return;
        const next = previewImages[(Math.max(0, previewIndex) + offset + previewImages.length) % previewImages.length];
        setPreviewNodeId(next.nodeId); setPreviewImageId(next.imageId || null);
    };
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const selectedNodes = useMemo(() => nodes.filter((node) => selectedNodeIds.has(node.id)), [nodes, selectedNodeIds]);
    const canGroupSelection = canGroupSelectedNodes(selectedNodeIds, contentNodes);
    const canUngroupSelection = canUngroupSelectedNodes(selectedNodeIds, contentNodes);
    const groupChildCountById = useMemo(() => {
        const map = new Map<string, number>();
        contentNodes.forEach((node) => {
            const groupId = node.metadata?.groupId;
            if (groupId) map.set(groupId, (map.get(groupId) || 0) + 1);
        });
        return map;
    }, [contentNodes]);

    const configInputsById = useMemo(() => {
        const map = new Map<string, NodeGenerationInput[]>();
        contentNodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Config) return;
            map.set(node.id, buildNodeGenerationInputs(node.id, contentNodes, connections));
        });
        return map;
    }, [connections, contentNodes]);
    const mentionReferencesByNodeId = useMemo(() => {
        const map = new Map<string, ReturnType<typeof buildNodeMentionReferences>>();
        contentNodes.forEach((node) => map.set(node.id, buildNodeMentionReferences(node, contentNodes, connections)));
        return map;
    }, [connections, contentNodes]);
    const connectedNodesByNodeId = useMemo(() => {
        const map = new Map<string, CanvasNodeData[]>();
        connections.forEach((connection) => {
            const source = contentNodeById.get(connection.fromNodeId);
            if (!source) return;
            const connected = map.get(connection.toNodeId);
            if (connected) connected.push(source);
            else map.set(connection.toNodeId, [source]);
        });
        return map;
    }, [connections, contentNodeById]);
    const referenceConnectedNodeIds = useMemo(() => new Set([referencePickerNodeId, ...(referencePickerNodeId ? connectedNodesByNodeId.get(referencePickerNodeId)?.flatMap((node) => node.type === CanvasNodeType.Group ? [node.id, ...getGroupResourceNodes(node.id, contentNodes).map((child) => child.id)] : [node.id]) || [] : [])].filter((id): id is string => Boolean(id))), [connectedNodesByNodeId, contentNodes, referencePickerNodeId]);
    const { applyAgentOps } = useAgentBridge({
        isNodeDragging,
        projectId,
        title: currentProject?.title,
        getCanvasCenter,
        nodes,
        connections,
        selectedNodeIds,
        viewport,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        viewportRef,
        generateNodeRef,
        pluginHostRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setViewport,
        setContextMenu,
    });

    const { pluginHost, renderPluginPanel, buildNodeToolbarItems } = usePluginHost({
        contentNodes,
        nodeDraggingRef,
        projectId,
        effectiveConfig,
        isAiConfigReady,
        openConfigDialog,
        theme,
        nodesRef,
        connectionsRef,
        viewportRef,
        setNodes,
        setDialogNodeId,
        applyAgentOps,
    });
    pluginHostRef.current = pluginHost;
    const createNode = useCallback(
        (type: CanvasNodeTypeId, position?: Position) => {
            const targetPosition = position || getCanvasCenter();
            const configMetadata =
                type === CanvasNodeType.Config
                    ? {
                          model: effectiveConfig.imageModel || effectiveConfig.model,
                          size: effectiveConfig.size,
                          count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                      }
                    : undefined;
            const newNode = createCanvasNode(type, targetPosition, configMetadata);

            setNodes((prev) => [...prev, newNode]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            const definition = getNodeDefinition(type);
            // Display-only plugin nodes with hidePanel do not open a panel; custom Panels require autoOpenPanel on creation.
            // Plugin nodes declaring useBuiltinPanel open the built-in generation panel on creation, like image nodes.
            // Built-in image, video, and config nodes retain their existing open-on-create behavior.
            const wantsPanel = definition?.hidePanel
                ? false
                : definition?.Panel
                  ? Boolean(definition.autoOpenPanel)
                  : definition?.useBuiltinPanel
                    ? true
                    : false;
            if (wantsPanel) setDialogNodeId(newNode.id);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, getCanvasCenter],
    );

    const deleteNodes = useCallback(
        (ids: Set<string>) => {
            if (!ids.size) return;
            const allIds = new Set(ids);
            const runningIds = new Set<string>();
            generationRequestsRef.current.forEach((request) => {
                if (allIds.has(request.targetNodeId) || allIds.has(request.originNodeId) || allIds.has(request.runningNodeId)) runningIds.add(request.runningNodeId);
            });
            runningIds.forEach(stopGenerationByRunningId);
            setNodes((prev) => {
                const next = prev.filter((node) => !allIds.has(node.id));
                return next.map((node) => {
                    const groupId = node.metadata?.groupId;
                    if (groupId && allIds.has(groupId)) return { ...node, metadata: { ...node.metadata, groupId: undefined } };
                    return node;
                });
            });
            setConnections((prev) => prev.filter((conn) => !allIds.has(conn.fromNodeId) && !allIds.has(conn.toNodeId)));
            setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
            setToolbarNodeId((current) => (current && allIds.has(current) ? null : current));
            setDialogNodeId((current) => (current && allIds.has(current) ? null : current));
            setInfoNodeId((current) => (current && allIds.has(current) ? null : current));
            setPaintNodeId((current) => (current && allIds.has(current) ? null : current));
            setExtractNodeId((current) => (current && allIds.has(current) ? null : current));
            setCropNodeId((current) => (current && allIds.has(current) ? null : current));
            setMaskEditNodeId((current) => (current && allIds.has(current) ? null : current));
            setAngleNodeId((current) => (current && allIds.has(current) ? null : current));
            setPreviewNodeId((current) => (current && allIds.has(current) ? null : current));
            setRunningNodeId((current) => (current && allIds.has(current) ? null : current));
            setReferencePickerNodeId((current) => (current && allIds.has(current) ? null : current));
            setExpandedBatchNodeIds((current) => new Set([...current].filter((nodeId) => !allIds.has(nodeId))));
            setContextMenu((current) => (current?.type === "node" && allIds.has(current.nodeId) ? null : current));
            cleanupCanvasFiles({ projectId, nodes: nodesRef.current.filter((node) => !allIds.has(node.id)), chatSessions });
        },
        [chatSessions, cleanupCanvasFiles, projectId, stopGenerationByRunningId],
    );

    const groupSelection = useCallback(() => {
        const selectedIds = selectedNodeIdsRef.current;
        const members = collectGroupMemberNodes(selectedIds, nodesRef.current);
        if (members.length < 2) return;
        const rect = getGroupWrapRect(members);
        const created = createCanvasNode(CanvasNodeType.Group, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        const result = applyGroupSelection(selectedIds, nodesRef.current, connectionsRef.current, { ...created, position: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height });
        if (!result) return;
        setNodes(result.nodes);
        setConnections(result.connections);
        setSelectedNodeIds(new Set(result.selectedIds));
        setSelectedConnectionId(null);
        setToolbarNodeId(result.selectedIds[0] || null);
        setDialogNodeId(null);
        setContextMenu(null);
    }, []);

    const ungroupSelection = useCallback((ids?: Set<string>) => {
        const result = applyUngroupSelection(ids || selectedNodeIdsRef.current, nodesRef.current, connectionsRef.current);
        if (!result) return;
        setNodes(result.nodes);
        setConnections(result.connections);
        setSelectedNodeIds(new Set(result.selectedIds));
        setSelectedConnectionId(null);
        setToolbarNodeId(result.selectedIds.length === 1 ? result.selectedIds[0] : null);
        setDialogNodeId(null);
        setContextMenu(null);
    }, []);

    const deleteConnection = useCallback((connectionId: string) => {
        setConnections((prev) => prev.filter((conn) => conn.id !== connectionId));
        setSelectedConnectionId((current) => (current === connectionId ? null : current));
        setContextMenu((current) => (current?.type === "connection" && current.connectionId === connectionId ? null : current));
    }, []);

    const disconnectNodeReference = useCallback((fromNodeId: string, toNodeId: string) => {
        setConnections((prev) => prev.filter((connection) => connection.fromNodeId !== fromNodeId || connection.toNodeId !== toNodeId));
    }, []);

    const addImageReference = useCallback(async (nodeId: string, item: GalleryImage): Promise<NodeGenerationInput> => {
        const project = generationProjectRef.current;
        if (!nodesRef.current.some((node) => node.id === nodeId)) throw new Error("生成配置已删除");
        const matchesImage = (node: CanvasNodeData) => node.type === CanvasNodeType.Image && (item.storageKey ? node.metadata?.storageKey === item.storageKey : node.metadata?.content === item.url);
        let source = nodesRef.current.find(matchesImage);
        if (!source) {
            const blob = item.storageKey ? await getImageBlob(item.storageKey) : null;
            const image = item.storageKey && blob
                ? { url: await resolveImageUrl(item.storageKey), storageKey: item.storageKey, width: item.width, height: item.height, bytes: blob.size, mimeType: blob.type }
                : await uploadImage(item.url);
            if (!project.alive || generationProjectRef.current !== project) throw new Error("画布已切换，请重新选择素材");
            const target = nodesRef.current.find((node) => node.id === nodeId);
            if (!target) throw new Error("生成配置已删除");
            source = nodesRef.current.find(matchesImage);
            if (!source) {
                const dimensions = fitNodeSize(image.width, image.height);
                const offset = connectionsRef.current.filter((connection) => connection.toNodeId === nodeId).length * 40;
                source = { ...createCanvasNode(CanvasNodeType.Image, { x: target.position.x - 96 - dimensions.width / 2, y: target.position.y + offset + dimensions.height / 2 }, imageMetadata(image)), ...dimensions, position: { x: target.position.x - 96 - dimensions.width, y: target.position.y + offset }, title: item.title };
            }
        }
        if (!project.alive || generationProjectRef.current !== project) throw new Error("画布已切换，请重新选择素材");
        const referenceNode = source;
        const nextNodes = nodesRef.current.some((node) => node.id === referenceNode.id) ? nodesRef.current : [...nodesRef.current, referenceNode];
        const nextConnections = connectionsRef.current.some((connection) => connection.fromNodeId === referenceNode.id && connection.toNodeId === nodeId)
            ? connectionsRef.current : [...connectionsRef.current, { id: nanoid(), fromNodeId: referenceNode.id, toNodeId: nodeId }];
        const input = buildNodeGenerationInputs(nodeId, nextNodes, nextConnections).find((candidate) => candidate.nodeId === referenceNode.id);
        if (!input) throw new Error("无法读取所选图片，请重新选择");
        nodesRef.current = nextNodes;
        connectionsRef.current = nextConnections;
        setNodes(nextNodes);
        setConnections(nextConnections);
        return input;
    }, []);

    const startNodeReferenceSelection = useCallback((nodeId: string) => {
        setReferencePickerNodeId(nodeId);
        setSelectedNodeIds(new Set([nodeId]));
        setSelectedConnectionId(null);
        setDialogNodeId(null);
    }, []);

    const exitNodeReferenceSelection = useCallback(() => {
        if (!referencePickerNodeId) return;
        setSelectedNodeIds(new Set([referencePickerNodeId]));
        setDialogNodeId(referencePickerNodeId);
        setReferencePickerNodeId(null);
    }, [referencePickerNodeId]);

    const selectNodeReference = useCallback((fromNodeId: string) => {
        if (!referencePickerNodeId || referenceConnectedNodeIds.has(fromNodeId)) return;
        const source = nodesRef.current.find((node) => node.id === fromNodeId);
        if (!source || !isCanvasReferenceNode(source, nodesRef.current)) return;
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId, toNodeId: referencePickerNodeId }]);
    }, [referenceConnectedNodeIds, referencePickerNodeId]);

    useEffect(() => {
        if (!referencePickerNodeId) return;
        const exit = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            exitNodeReferenceSelection();
        };
        window.addEventListener("keydown", exit, true);
        return () => window.removeEventListener("keydown", exit, true);
    }, [exitNodeReferenceSelection, referencePickerNodeId]);

    const deselectCanvas = useCallback(() => {
        cancelPendingConnectionCreate();
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setSelectionBox(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
    }, [cancelPendingConnectionCreate]);

    const clearCanvas = useCallback(() => {
        generationRequestsRef.current.forEach((request) => request.controller.abort());
        generationRequestsRef.current.clear();
        setNodes([]);
        setConnections([]);
        setInfoNodeId(null);
        setPaintNodeId(null);
        setExtractNodeId(null);
        setCropNodeId(null);
        setMaskEditNodeId(null);
        setAngleNodeId(null);
        setPreviewNodeId(null);
        setRunningNodeId(null);
        deselectCanvas();
        setClearConfirmOpen(false);
        cleanupCanvasFiles({ projectId, nodes: [], chatSessions: [] });
    }, [cleanupCanvasFiles, deselectCanvas, projectId]);

    const duplicateNode = useCallback((nodeId: string) => {
        const source = nodesRef.current.find((node) => node.id === nodeId);
        if (!source) return;

        const id = `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const next: CanvasNodeData = {
            ...source,
            id,
            title: `${source.title} Copy`,
            position: { x: source.position.x + 36, y: source.position.y + 36 },
        };
        const referenceConnections = connectionsRef.current.filter((connection) => connection.toNodeId === nodeId).map((connection) => ({ ...connection, id: nanoid(), toNodeId: id }));

        setNodes((prev) => [...prev, next]);
        setConnections((prev) => [...prev, ...referenceConnections]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        if (next.type !== CanvasNodeType.Group) setDialogNodeId(id);
    }, []);

    const copySelectedNodes = useCallback((data?: DataTransfer | null) => {
        const selectedIds = selectedNodeIdsRef.current;
        if (!selectedIds.size) return;

        const copiedNodes = nodesRef.current
            .filter((node) => selectedIds.has(node.id))
            .map((node) => ({
                ...node,
                position: { ...node.position },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            }));

        if (!copiedNodes.length) return;

        // 文本节点写正文、其它节点写提示词或标题：复制到别的程序时得到的是可读内容，
        // 不再是内部 token。全部为空时才退回 token，保证程序内仍能识别这份剪贴板。
        const text = copiedNodes
            .map((node) => (node.type === CanvasNodeType.Text ? node.metadata?.content || "" : node.metadata?.prompt || node.title || ""))
            .filter(Boolean)
            .join("\n");
        const token = nanoid();

        clipboardRef.current = {
            token,
            text,
            nodes: copiedNodes,
            connections: connectionsRef.current.filter((connection) => selectedIds.has(connection.toNodeId)).map((connection) => ({ ...connection })),
        };
        if (data) {
            data.setData(CANVAS_IMAGE_CLIPBOARD_TYPE, token);
            data.setData("text/plain", text || `blinkflow-canvas:${token}`);
        }
    }, []);

    const readCopiedImages = useCallback((data: DataTransfer): ReferenceImage[] => {
        const clipboard = clipboardRef.current;
        if (!clipboard || data.getData(CANVAS_IMAGE_CLIPBOARD_TYPE) !== clipboard.token) return [];
        return clipboard.nodes.flatMap(sourceNodeReferenceImages);
    }, []);

    const pasteCopiedNodes = useCallback(() => {
        const clipboard = clipboardRef.current;
        if (!clipboard?.nodes.length) return false;

        const center = getCanvasCenter();
        const bounds = clipboard.nodes.reduce(
            (acc, node) => ({
                left: Math.min(acc.left, node.position.x),
                top: Math.min(acc.top, node.position.y),
                right: Math.max(acc.right, node.position.x + node.width),
                bottom: Math.max(acc.bottom, node.position.y + node.height),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const dx = center.x - (bounds.left + bounds.right) / 2;
        const dy = center.y - (bounds.top + bounds.bottom) / 2;
        const idMap = new Map<string, string>();
        const nextNodes = clipboard.nodes.map((node, index) => {
            const id = `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
            idMap.set(node.id, id);
            return {
                ...node,
                id,
                title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
                position: {
                    x: node.position.x + dx,
                    y: node.position.y + dy,
                },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            };
        });

        const pastedNodes = nextNodes.map((node) => {
            const groupId = node.metadata?.groupId;
            if (!groupId) return node;
            return { ...node, metadata: { ...node.metadata, groupId: idMap.get(groupId) } };
        });

        const nextConnections = clipboard.connections.flatMap((connection, index) => {
            const toNodeId = idMap.get(connection.toNodeId);
            if (!toNodeId) return [];
            return [
                {
                    ...connection,
                    id: `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
                    fromNodeId: idMap.get(connection.fromNodeId) ?? connection.fromNodeId,
                    toNodeId,
                },
            ];
        });

        setNodes((prev) => [...prev, ...pastedNodes]);
        setConnections((prev) => [...prev, ...nextConnections]);
        setSelectedNodeIds(new Set(pastedNodes.map((node) => node.id)));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(pastedNodes[0]?.type === CanvasNodeType.Group ? null : pastedNodes[0]?.id || null);
        return true;
    }, [getCanvasCenter]);

    const resetViewport = useCallback(() => {
        setViewport({ x: size.width / 2, y: size.height / 2, k: 1 });
        setContextMenu(null);
    }, [size.height, size.width]);

    const focusNode = useCallback(
        (nodeId: string) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            if (!node) return;
            const target = focusViewportForNode(node, size, measureFocusFrame(containerRef.current, nodeId));
            setSelectedNodeIds(new Set([nodeId]));
            setSelectedConnectionId(null);
            setContextMenu(null);

            if (focusAnimRef.current) cancelAnimationFrame(focusAnimRef.current);
            const start = { ...viewportRef.current };
            const duration = 450;
            const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
            let startTime: number | null = null;
            const step = (now: number) => {
                if (startTime === null) startTime = now;
                const progress = Math.min((now - startTime) / duration, 1);
                const t = easeOutCubic(progress);
                setViewport({ x: start.x + (target.x - start.x) * t, y: start.y + (target.y - start.y) * t, k: start.k + (target.k - start.k) * t });
                focusAnimRef.current = progress < 1 ? requestAnimationFrame(step) : null;
            };
            focusAnimRef.current = requestAnimationFrame(step);
        },
        [size.height, size.width],
    );

    const focusNodeRef = useRef(focusNode);
    useEffect(() => {
        focusNodeRef.current = focusNode;
    }, [focusNode]);

    const focusSelectedNode = useCallback(() => {
        const nodeId = selectedNodeIdsRef.current.values().next().value;
        if (nodeId) focusNode(nodeId);
    }, [focusNode]);

    useEffect(() => () => void (focusAnimRef.current && cancelAnimationFrame(focusAnimRef.current)), []);

    const setZoomScale = useCallback(
        (scale: number) => {
            const nextScale = Math.min(Math.max(scale, 0.05), 5);
            setViewport((prev) => ({
                x: size.width / 2 - ((size.width / 2 - prev.x) / prev.k) * nextScale,
                y: size.height / 2 - ((size.height / 2 - prev.y) / prev.k) * nextScale,
                k: nextScale,
            }));
            setContextMenu(null);
        },
        [size.height, size.width],
    );

    const applyHistory = useCallback((entry: CanvasHistoryEntry) => {
        if (historyCommitTimerRef.current) {
            clearTimeout(historyCommitTimerRef.current);
            historyCommitTimerRef.current = null;
        }
        applyingHistoryRef.current = true;
        setNodes(entry.nodes);
        setConnections(entry.connections);
        setChatSessions(entry.chatSessions);
        setActiveChatId(entry.activeChatId);
        setBackgroundMode(entry.backgroundMode);
        setShowImageInfo(entry.showImageInfo);
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setTimeout(() => {
            lastHistoryRef.current = entry;
            applyingHistoryRef.current = false;
            setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
        });
    }, []);

    const undoCanvas = useCallback(() => {
        const previous = historyRef.current.past.pop();
        const current = lastHistoryRef.current;
        if (!previous || !current) return;
        historyRef.current.future.push(current);
        applyHistory(previous);
    }, [applyHistory]);

    const redoCanvas = useCallback(() => {
        const next = historyRef.current.future.pop();
        const current = lastHistoryRef.current;
        if (!next || !current) return;
        historyRef.current.past.push(current);
        applyHistory(next);
    }, [applyHistory]);

    const createAndOpenProject = useCallback(() => {
        const id = createProject(t("canvas.defaultTitle", { count: useCanvasStore.getState().projects.length + 1 }));
        navigate(`/canvas/${id}`);
    }, [createProject, navigate, t]);

    const deleteCurrentProject = useCallback(() => {
        deleteProjects([projectId]);
        cleanupAssetImages();
        navigate("/canvas");
    }, [cleanupAssetImages, deleteProjects, navigate, projectId]);

    const exportCurrentProject = useCallback(async () => {
        const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
        if (!project) return message.error(t("canvas.projectPage.notFound"));
        const hide = message.loading(t("canvas.projectPage.exporting"), 0);
        try {
            await exportCanvasProjects([project], project.title || t("canvas.title"));
            message.success(t("canvas.projectPage.exported"));
        } catch (error) {
            console.error(error);
            message.error(t("canvas.sidePanel.exportFailed"));
        } finally {
            hide();
        }
    }, [message, projectId, t]);

    const handleCanvasMouseDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            setContextMenu(null);
            setNodeCreatePosition(null);
            setToolbarNodeId(null);
            setDialogNodeId(null);
            if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
            if (event.button !== 0) return;

            const world = screenToCanvas(event.clientX, event.clientY);
            const nextSelectionBox = {
                startWorldX: world.x,
                startWorldY: world.y,
                currentWorldX: world.x,
                currentWorldY: world.y,
                additive: event.shiftKey,
                initialSelectedNodeIds: event.shiftKey ? Array.from(selectedNodeIdsRef.current) : [],
            };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            if (!event.shiftKey) {
                setSelectedNodeIds(new Set());
            }

            setSelectedConnectionId(null);
        },
        [cancelPendingConnectionCreate, screenToCanvas],
    );

    // Selection-only logic shared by the bubbling drag entry point and outer capture handler.
    // Returns the single target ID after the click, or null for multi-selection or deselection, to sync the toolbar.
    const selectNodeByEvent = useCallback((event: Pick<ReactMouseEvent, "shiftKey" | "metaKey" | "ctrlKey">, nodeId: string) => {
        const nextSelected = new Set(selectedNodeIdsRef.current);
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
            if (nextSelected.has(nodeId)) nextSelected.delete(nodeId);
            else nextSelected.add(nodeId);
        } else if (!nextSelected.has(nodeId)) {
            nextSelected.clear();
            nextSelected.add(nodeId);
        }
        setSelectedNodeIds(nextSelected);
        const soloId = nextSelected.size === 1 && nextSelected.has(nodeId) ? nodeId : null;
        setToolbarNodeId(soloId);
        return { nextSelected, soloId };
    }, []);

    // Capture-phase selection lets any inner element, including textarea or iframe, select the node and show its toolbar.
    // It only selects; body onMouseDown still starts dragging, so text selection inside editors does not drag the node.
    // Cache the capture result for the following bubbling drag handler to avoid applying shift-selection twice.
    const pendingSelectionRef = useRef<Set<string> | null>(null);
    const handleNodeSelectCapture = useCallback(
        (event: ReactMouseEvent, nodeId: string) => {
            if (event.button !== 0) return;
            // Handle drags must preserve a Shift-multiselection instead of toggling their own source off.
            if (event.target instanceof Element && event.target.closest("[data-node-handle]")) { pendingSelectionRef.current = null; return; }
            setContextMenu(null);
            setSelectedConnectionId(null);
            const { nextSelected } = selectNodeByEvent(event, nodeId);
            pendingSelectionRef.current = nextSelected;
        },
        [selectNodeByEvent],
    );

    const handleNodeMouseDown = useCallback((event: ReactMouseEvent, nodeId: string) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        if (focusAnimRef.current !== null) cancelAnimationFrame(focusAnimRef.current);
        focusAnimRef.current = null;
        // Capture already selected the node; this only starts dragging, with a fallback selection if capture did not run.
        const currentNodes = nodesRef.current;
        const nextSelected = pendingSelectionRef.current ?? selectNodeByEvent(event, nodeId).nextSelected;
        pendingSelectionRef.current = null;
        const dragIds = expandDragNodeIds(nextSelected, currentNodes);
        const initialSelectedNodes = new Map(currentNodes.filter((node) => dragIds.has(node.id)).map((node): [string, { x: number; y: number }] => [node.id, { x: node.position.x, y: node.position.y }]));
        dragRef.current = {
            isDraggingNode: true,
            hasMoved: false,
            startX: event.clientX,
            startY: event.clientY,
            initialSelectedNodes,
            movedIds: new Set(initialSelectedNodes.keys()),
            copyRequested: event.altKey,
            originalSelection: new Set(nextSelected),
            beforeCopy: null,
        };
        historyPausedRef.current = true;
        nodeDraggingRef.current = true;
        setIsNodeDragging(true);
    }, []);

    // Latch Alt at mouse-down, but create nothing until the existing drag threshold is crossed.
    const prepareNodeDrag = useCallback((clientX: number, clientY: number) => {
        const drag = dragRef.current;
        if (!drag.isDraggingNode) return;
        if (Math.abs(clientX - drag.startX) > 3 || Math.abs(clientY - drag.startY) > 3) drag.hasMoved = true;
        if (!drag.hasMoved || !drag.copyRequested || drag.beforeCopy) return;
        drag.beforeCopy = createHistoryEntry();
        if (historyCommitTimerRef.current) { clearTimeout(historyCommitTimerRef.current); historyCommitTimerRef.current = null; }
        const copy = cloneDragSelection(nodesRef.current, connectionsRef.current, drag.originalSelection);
        drag.initialSelectedNodes = new Map(copy.nodes.map((node) => [node.id, { ...node.position }]));
        drag.movedIds = new Set(drag.initialSelectedNodes.keys());
        nodesRef.current = [...nodesRef.current, ...copy.nodes];
        connectionsRef.current = [...connectionsRef.current, ...copy.connections];
        selectedNodeIdsRef.current = copy.selectedIds;
        setNodes(nodesRef.current); setConnections(connectionsRef.current); setSelectedNodeIds(copy.selectedIds);
        setDialogNodeId(null); setToolbarNodeId(null);
    }, [createHistoryEntry]);

    const finishNodeDrag = useCallback((clientX?: number, clientY?: number) => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        if (!dragRef.current.isDraggingNode) return;
        const canceled = clientX == null || clientY == null;
        if (!canceled) prepareNodeDrag(clientX, clientY);
        const drag = dragRef.current;

        const wasClick = !canceled && !drag.hasMoved && drag.initialSelectedNodes.size === 1;
        const clickedNodeId = dragRef.current.initialSelectedNodes.keys().next().value;
        const currentViewport = viewportRef.current;
        const dx = clientX == null ? 0 : (clientX - dragRef.current.startX) / currentViewport.k;
        const dy = clientY == null ? 0 : (clientY - dragRef.current.startY) / currentViewport.k;
        const initialPositions = dragRef.current.initialSelectedNodes;
        const movedIds = dragRef.current.movedIds;

        historyPausedRef.current = false;
        nodeDraggingRef.current = false;
        setIsNodeDragging(false);
        setDropTargetGroupId(null);
        if (canceled && drag.beforeCopy) {
            const before = drag.beforeCopy;
            const remaining = nodesRef.current.filter((node) => !movedIds.has(node.id));
            const remainingConnections = connectionsRef.current.filter((connection) => !movedIds.has(connection.fromNodeId) && !movedIds.has(connection.toNodeId));
            nodesRef.current = remaining.length === before.nodes.length && remaining.every((node, index) => node === before.nodes[index]) ? before.nodes : remaining;
            connectionsRef.current = remainingConnections.length === before.connections.length && remainingConnections.every((connection, index) => connection === before.connections[index]) ? before.connections : remainingConnections;
            selectedNodeIdsRef.current = drag.originalSelection;
            setNodes(nodesRef.current); setConnections(connectionsRef.current); setSelectedNodeIds(drag.originalSelection);
        } else if (drag.hasMoved && !canceled) {
            const moved = nodesRef.current.map((node) => {
                const initial = initialPositions.get(node.id);
                return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
            });
            const targetGroup = findGroupDropTarget(movedIds, moved);
            const settled = targetGroup ? snapNodesIntoGroup(movedIds, moved, targetGroup) : moved.map((node) => {
                if (!movedIds.has(node.id) || node.type === CanvasNodeType.Group) return node;
                if (node.metadata?.groupId && movedIds.has(node.metadata.groupId)) return node;
                const groupId = findContainingGroupId(node, moved);
                if (node.metadata?.groupId === groupId) return node;
                return { ...node, metadata: { ...node.metadata, groupId } };
            });
            nodesRef.current = settled;
            setNodes(settled);
            if (drag.beforeCopy) {
                const current = createHistoryEntry(), original = drag.beforeCopy, last = lastHistoryRef.current;
                const remaining = current.nodes.filter((node) => !movedIds.has(node.id));
                const remainingConnections = current.connections.filter((connection) => !movedIds.has(connection.fromNodeId) && !movedIds.has(connection.toNodeId));
                // Undo removes just this copy; results completed on original nodes during the gesture survive.
                const before = { ...current,
                    nodes: remaining.length === original.nodes.length && remaining.every((node, index) => node === original.nodes[index]) ? original.nodes : remaining,
                    connections: remainingConnections.length === original.connections.length && remainingConnections.every((connection, index) => connection === original.connections[index]) ? original.connections : remainingConnections,
                };
                const uncommitted = last && Object.keys(before).some((key) => last[key as keyof CanvasHistoryEntry] !== before[key as keyof CanvasHistoryEntry]);
                historyRef.current = { past: [...historyRef.current.past, ...(uncommitted ? [last] : []), before].slice(-50), future: [] };
                lastHistoryRef.current = current;
                setHistoryState({ canUndo: true, canRedo: false });
            }
        }

        if (canceled && drag.hasMoved && !drag.beforeCopy) setNodes(nodesRef.current);
        dragPaintRef.current = { nodes: [], edges: [], groupId: null };
        dragRef.current.isDraggingNode = false;
        dragRef.current.hasMoved = false;
        dragRef.current.initialSelectedNodes = new Map();
        dragRef.current.movedIds = new Set();
        dragRef.current.beforeCopy = null;
        dragRef.current.copyRequested = false;
        dragRef.current.originalSelection = new Set();
        if (wasClick && clickedNodeId) {
            const clickedNode = nodesRef.current.find((node) => node.id === clickedNodeId);
            const clickedDefinition = clickedNode ? getNodeDefinition(clickedNode.type) : undefined;
            if (clickedDefinition?.hidePanel) {
                // Clicking a display-only plugin node selects it without opening a lower panel.
                setDialogNodeId((current) => (current === clickedNodeId ? current : null));
            } else if (clickedNode?.type !== CanvasNodeType.Group) {
                setDialogNodeId(clickedNodeId);
                if (useConfigStore.getState().config.autoFocusOnSelect) {
                    // Wait for the generation panel to render so centering accounts for it.
                    requestAnimationFrame(() => focusNodeRef.current(clickedNodeId));
                }
            }
        }
    }, [createHistoryEntry, prepareNodeDrag]);

    const handleGlobalMouseMove = useCallback(
        (event: MouseEvent) => {
            if (dragRef.current.isDraggingNode) {
                prepareNodeDrag(event.clientX, event.clientY);
                if (!dragRef.current.hasMoved) return;
                dragPointerRef.current = { x: event.clientX, y: event.clientY };
                // Keep the scheduled frame and consume the latest pointer, even under a burst of mouse events.
                if (rafRef.current !== null) return;
                rafRef.current = requestAnimationFrame(() => {
                    rafRef.current = null;
                    if (!dragRef.current.isDraggingNode) return;
                    paintNodeDrag();
                    const groupId = findGroupDropTarget(dragRef.current.movedIds, nodesRef.current)?.id || null;
                    if (groupId !== dragPaintRef.current.groupId) {
                        dragPaintRef.current.groupId = groupId;
                        setDropTargetGroupId(groupId);
                    }
                });
                return;
            }

            if (connectingParamsRef.current && !pendingConnectionCreateRef.current) {
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, connectingParamsRef.current);
                connectionTargetNodeIdRef.current = dropTarget.nodeId;
                setConnectionTargetNodeId(dropTarget.nodeId);
                setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            }
        },
        [prepareNodeDrag, getConnectionDropTarget, screenToCanvas, paintNodeDrag],
    );

    const handleGlobalPointerMove = useCallback(
        (event: PointerEvent) => {
            const currentSelection = selectionBoxRef.current;
            if (!currentSelection) return;

            if (event.buttons === 0) {
                selectionBoxRef.current = null;
                setSelectionBox(null);
                return;
            }

            const world = screenToCanvas(event.clientX, event.clientY);
            const rectX = Math.min(currentSelection.startWorldX, world.x);
            const rectY = Math.min(currentSelection.startWorldY, world.y);
            const rectW = Math.abs(world.x - currentSelection.startWorldX);
            const rectH = Math.abs(world.y - currentSelection.startWorldY);
            const nextSelected = new Set<string>(currentSelection.additive ? currentSelection.initialSelectedNodeIds : []);

            nodesRef.current
                .forEach((node) => {
                    const intersects = rectX < node.position.x + node.width && rectX + rectW > node.position.x && rectY < node.position.y + node.height && rectY + rectH > node.position.y;

                    if (intersects) nextSelected.add(node.id);
                });

            const nextSelectionBox = { ...currentSelection, currentWorldX: world.x, currentWorldY: world.y };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            setSelectedNodeIds(nextSelected);
        },
        [screenToCanvas],
    );

    const handleGlobalMouseUp = useCallback(
        (event: MouseEvent) => {
            finishNodeDrag(event.clientX, event.clientY);

            selectionBoxRef.current = null;
            setSelectionBox(null);

            if (pendingConnectionCreateRef.current) return;

            const currentConnection = connectingParamsRef.current;
            if (currentConnection) {
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, currentConnection);
                if (dropTarget.nodeId) {
                    connectNodes(currentConnection, dropTarget.nodeId, event.clientX, event.clientY);
                    setConnecting(null);
                } else if (dropTarget.isNearNode) {
                    setConnecting(null);
                } else {
                    const position = screenToCanvas(event.clientX, event.clientY);
                    setMouseWorld(position);
                    setPendingConnectionCreate({ connection: currentConnection, position });
                }
            }
        },
        [connectNodes, finishNodeDrag, getConnectionDropTarget, screenToCanvas, setConnecting],
    );

    useEffect(() => {
        const handlePointerUp = (event: PointerEvent) => finishNodeDrag(event.clientX, event.clientY);
        const cancelNodeDrag = () => finishNodeDrag();
        const cancelCopyOnEscape = (event: KeyboardEvent) => {
            if (!dragRef.current.isDraggingNode || !dragRef.current.copyRequested) return;
            const key = event.key.toLowerCase();
            const historyShortcut = (event.ctrlKey || event.metaKey) && (key === "z" || key === "y");
            if (key !== "escape" && !historyShortcut) return;
            event.preventDefault(); event.stopImmediatePropagation(); finishNodeDrag();
        };
        window.addEventListener("mousemove", handleGlobalMouseMove);
        window.addEventListener("mouseup", handleGlobalMouseUp);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", cancelNodeDrag);
        window.addEventListener("blur", cancelNodeDrag);
        window.addEventListener("keydown", cancelCopyOnEscape, true);
        window.addEventListener("pointermove", handleGlobalPointerMove);
        return () => {
            window.removeEventListener("mousemove", handleGlobalMouseMove);
            window.removeEventListener("mouseup", handleGlobalMouseUp);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", cancelNodeDrag);
            window.removeEventListener("blur", cancelNodeDrag);
            window.removeEventListener("keydown", cancelCopyOnEscape, true);
            window.removeEventListener("pointermove", handleGlobalPointerMove);
        };
    }, [finishNodeDrag, handleGlobalMouseMove, handleGlobalMouseUp, handleGlobalPointerMove]);

    const createImageFileNode = useCallback(async (file: File, position: Position) => {
        const image = await uploadImage(file);
        const size = fitNodeSize(image.width, image.height);
        const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newNode: CanvasNodeData = {
            id,
            type: CanvasNodeType.Image,
            title: file.name,
            position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
            width: size.width,
            height: size.height,
            metadata: imageMetadata(image),
        };

        setNodes((prev) => [...prev, newNode]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    /** 粘贴 text/html 里的图片：先取回字节再入库，跨域取不到时由调用方提示失败。 */
    const createImageFromClipboardSource = useCallback(async (source: string, position: Position) => {
        const response = await fetch(source);
        if (!response.ok) throw new Error("图片读取失败");
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error("不是图片");
        const extension = blob.type.split("/")[1]?.split("+")[0] || "png";
        await createImageFileNode(new File([blob], `clipboard-${Date.now()}.${extension}`, { type: blob.type }), position);
        message.success(t("canvas.projectPage.clipboardImageAdded"));
    }, [createImageFileNode, message, t]);

    const createDroppedImageGrid = useCallback(async (files: File[], position: Position) => {
        const project = generationProjectRef.current;
        const imported: CanvasNodeData[] = [];
        for (const file of files) {
            if (!project.alive || generationProjectRef.current !== project) return;
            try {
                const image = await uploadImage(file), size = fitNodeSize(image.width, image.height);
                imported.push({ id: nanoid(), type: CanvasNodeType.Image, title: file.name, position: { ...position }, ...size, metadata: imageMetadata(image) });
            } catch (error) { message.error(`${file.name}：${error instanceof Error ? error.message : "图片导入失败"}`); }
        }
        if (!imported.length || !project.alive || generationProjectRef.current !== project) return;
        const selected = new Set(imported.map((node) => node.id));
        const arranged = arrangeGrid(imported, selected, 2, 48);
        // Anchor the first image at the drop point, just like a single-image import.
        const offset = { x: imported[0].width / 2, y: imported[0].height / 2 };
        setNodes((previous) => [...previous, ...arranged.map((node) => ({ ...node, position: { x: node.position.x - offset.x, y: node.position.y - offset.y } }))]);
        setSelectedNodeIds(selected); setSelectedConnectionId(null); setDialogNodeId(null);
    }, [message]);

    const createVideoFileNode = useCallback(async (file: File, position: Position) => {
        const video = await uploadMediaFile(file, "video");
        const size = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
        const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setNodes((prev) => [
            ...prev,
            {
                id,
                type: CanvasNodeType.Video,
                title: file.name,
                position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
                width: size.width,
                height: size.height,
                metadata: videoMetadata(video),
            },
        ]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const createAudioFileNode = useCallback(async (file: File, position: Position) => {
        const audio = await uploadMediaFile(file, "audio");
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
        const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setNodes((prev) => [
            ...prev,
            {
                id,
                type: CanvasNodeType.Audio,
                title: file.name,
                position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
                width: spec.width,
                height: spec.height,
                metadata: audioMetadata(audio),
            },
        ]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
    }, []);

    const createTextNodeFromClipboard = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return false;

            const node = {
                ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content: text, status: NODE_STATUS_SUCCESS }),
                title: trimmed.slice(0, 32) || t("canvas.projectPage.clipboardText"),
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setDialogNodeId(node.id);
            return true;
        },
        [getCanvasCenter, t],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (event.defaultPrevented) return;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest(".cm-editor,[role=\"textbox\"],[contenteditable]:not([contenteditable='false']),[data-canvas-no-zoom],[data-canvas-shortcuts-ignore]")) return;

            const key = event.key.toLowerCase();
            const isModifierShortcut = event.metaKey || event.ctrlKey;
            if (dragRef.current.isDraggingNode && ((isModifierShortcut && ["z", "y", "a", "c", "v", "g"].includes(key)) || key === "delete" || key === "backspace")) {
                event.preventDefault(); return;
            }

            if (isModifierShortcut && key === "c" && selectionBlocksCanvasCopy()) return;

            if (isModifierShortcut && !event.altKey && key === "c" && canWriteClipboardImage()) {
                const selected = nodesRef.current.filter((node) => selectedNodeIdsRef.current.has(node.id));
                const node = selected.length === 1 && selected[0].type === CanvasNodeType.Image ? selected[0] : null;
                if (node?.metadata?.content) {
                    event.preventDefault();
                    copySelectedNodes();
                    const clipboard = clipboardRef.current!;
                    const text = clipboard.text || `blinkflow-canvas:${clipboard.token}`;
                    void (async () => {
                        const stored = node.metadata?.storageKey ? await getImageBlob(node.metadata.storageKey) : null;
                        const blob: Blob | null = stored || await fetch(node.metadata!.content!).then((response) => {
                            if (!response.ok) throw new Error("图片读取失败");
                            return response.blob();
                        });
                        if (!blob) throw new Error("图片读取失败");
                        if (blob.type === "image/png") return blob;
                        const bitmap = await createImageBitmap(blob);
                        try {
                            const canvas = document.createElement("canvas");
                            canvas.width = bitmap.width;
                            canvas.height = bitmap.height;
                            const context = canvas.getContext("2d");
                            if (!context) throw new Error("图片读取失败");
                            context.drawImage(bitmap, 0, 0);
                            return await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("图片转换失败")), "image/png"));
                        } finally {
                            bitmap.close();
                        }
                    })().then(
                        (png) => writeClipboard({ png, text }),
                        // 图片转 PNG 失败（SVG、已失效的 blob 等）时至少把文本写进去，
                        // 这样程序内复制粘贴仍然可用，而不是留一份旧剪贴板。
                        () => writeClipboardText(text),
                    ).catch(() => {
                        void writeClipboardText(text).catch(() => message.error("复制图片失败，请检查系统的剪贴板权限"));
                    });
                    return;
                }
            }

            if (isModifierShortcut && !event.altKey && key === "z") {
                event.preventDefault();
                if (event.shiftKey) redoCanvas();
                else undoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "y") {
                event.preventDefault();
                redoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "a") {
                event.preventDefault();
                setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
                setSelectedConnectionId(null);
                setContextMenu(null);
                setSelectionBox(null);
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "g") {
                if (event.shiftKey) {
                    if (canUngroupSelectedNodes(selectedNodeIdsRef.current, nodesRef.current)) {
                        event.preventDefault();
                        ungroupSelection();
                    }
                    return;
                }
                if (canGroupSelectedNodes(selectedNodeIdsRef.current, nodesRef.current)) {
                    event.preventDefault();
                    groupSelection();
                }
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                if (selectedNodeIdsRef.current.size) {
                    deleteNodes(new Set(selectedNodeIdsRef.current));
                } else if (selectedConnectionId) {
                    deleteConnection(selectedConnectionId);
                }
            }

            if (event.key === "Escape") {
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
                setContextMenu(null);
                setNodeCreatePosition(null);
                setSelectionBox(null);
                setConnecting(null);
                setToolbarNodeId(null);
                setDialogNodeId(null);
                setInfoNodeId(null);
                setPaintNodeId(null);
                setExtractNodeId(null);
                setCropNodeId(null);
                setMaskEditNodeId(null);
                setPendingConnectionCreate(null);
            }
        };

        const handleCopy = (event: ClipboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (event.defaultPrevented || !event.clipboardData) return;
            // 只让位于侧栏/面板里的文字选区走系统复制；在画布上拖选留存的选区不该挡住节点复制。
            if (selectionBlocksCanvasCopy()) return;
            if (target?.closest("input,textarea,select,.cm-editor,[role=\"textbox\"],[contenteditable]:not([contenteditable='false']),[data-canvas-overlay],[data-canvas-shortcuts-ignore]")) return;
            if (dragRef.current.isDraggingNode || !nodesRef.current.some((node) => selectedNodeIdsRef.current.has(node.id))) return;
            copySelectedNodes(event.clipboardData);
            event.preventDefault();
        };
        const handlePaste = (event: ClipboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (event.defaultPrevented || !event.clipboardData || dragRef.current.isDraggingNode) return;
            if (target?.closest("input,textarea,select,.cm-editor,[role=\"textbox\"],[contenteditable]:not([contenteditable='false']),[data-canvas-overlay],[data-canvas-shortcuts-ignore],.ant-modal-wrap")) return;

            const data = event.clipboardData;
            const copied = clipboardRef.current;
            const customToken = data.getData(CANVAS_IMAGE_CLIPBOARD_TYPE);
            const plain = data.getData("text/plain");
            // 三选一命中即视为本程序刚复制的节点：自定义类型、写进去的可读文本，
            // 以及没有任何可读文本时退回的 token。
            const fromCanvas = Boolean(copied) && (customToken === copied!.token || (copied!.text !== "" && plain === copied!.text) || plain === `blinkflow-canvas:${copied!.token}`);
            if (fromCanvas) {
                if (pasteCopiedNodes()) event.preventDefault();
                return;
            }

            const images = Array.from(data.files).filter((file) => file.type.startsWith("image/"));
            if (!images.length) {
                for (const item of Array.from(data.items)) {
                    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
                    const file = item.getAsFile();
                    if (file) images.push(file);
                }
            }
            if (images.length) {
                event.preventDefault();
                const position = getCanvasCenter();
                if (images.length > 1) {
                    void createDroppedImageGrid(images, position);
                } else {
                    void createImageFileNode(images[0], position)
                        .then(() => message.success(t("canvas.projectPage.clipboardImageAdded")))
                        .catch(() => message.error("粘贴图片失败"));
                }
                return;
            }
            // 有的程序只把图片写进 text/html（Office、部分截图工具），退回解析 <img src>。
            const imageSource = clipboardImageSource(data.getData("text/html"));
            if (imageSource) {
                event.preventDefault();
                void createImageFromClipboardSource(imageSource, getCanvasCenter()).catch(() => message.error("粘贴图片失败"));
                return;
            }
            const text = data.getData("text/plain");
            if (createTextNodeFromClipboard(text)) {
                event.preventDefault();
                message.success(t("canvas.projectPage.clipboardTextAdded"));
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("copy", handleCopy);
        window.addEventListener("paste", handlePaste);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("copy", handleCopy);
            window.removeEventListener("paste", handlePaste);
        };
    }, [copySelectedNodes, deleteConnection, deleteNodes, groupSelection, pasteCopiedNodes, createImageFileNode, createImageFromClipboardSource, createDroppedImageGrid, createTextNodeFromClipboard, getCanvasCenter, message, t, redoCanvas, selectedConnectionId, setConnecting, undoCanvas, ungroupSelection]);

    const handleConnectStart = useCallback(
        (event: ReactMouseEvent, nodeId: string, handleType: "source" | "target", portId?: string) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            pendingSelectionRef.current = null;
            const selected = selectedNodeIdsRef.current;
            const sourceNodeIds = handleType === "source" && selected.has(nodeId) && selected.size > 1 ? [nodeId, ...Array.from(selected).filter((id) => id !== nodeId)] : undefined;
            setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            setConnecting({ nodeId, handleType, portId, sourceNodeIds });
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
        },
        [screenToCanvas, setConnecting],
    );

    const handleNodeResize = useCallback((nodeId: string, width: number, height: number, position?: Position) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, width, height, position: position || node.position, ...(node.type === CanvasNodeType.Image ? { metadata: { ...node.metadata, imageSizeManual: true } } : {}) } : node)));
    }, []);

    const handleNodeResizeStart = useCallback(() => {
        setIsNodeResizing(true);
    }, []);
    const handleNodeResizeEnd = useCallback(() => setIsNodeResizing(false), []);

    const toggleNodeFreeResize = useCallback((nodeId: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                const freeResize = !node.metadata?.freeResize;
                if (freeResize || node.type !== CanvasNodeType.Image) return { ...node, metadata: { ...node.metadata, freeResize } };
                const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
                const height = node.width / ratio;
                return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
            }),
        );
    }, []);

    const handleNodeContentChange = useCallback((nodeId: string, content: string) => {
        setNodes((prev) =>
            prev.map((node) =>
                node.id === nodeId
                    ? { ...node, metadata: { ...node.metadata, content, texts: node.metadata?.texts?.map((text) => (text.id === node.metadata?.primaryTextId ? { ...text, content } : text)) } }
                    : node,
            ),
        );
    }, []);

    const handleNodeTitleChange = useCallback((nodeId: string, title: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, title } : node)));
    }, []);

    const toggleBatchExpanded = useCallback((nodeId: string) => {
        setExpandedBatchNodeIds((current) => {
            const next = new Set(current);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    }, []);

    const setBatchPrimary = useCallback((nodeId: string, itemId: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                if (node.type === CanvasNodeType.Text) {
                    const text = node.metadata?.texts?.find((item) => item.id === itemId);
                    return text?.content ? { ...node, metadata: { ...node.metadata, content: text.content, primaryTextId: text.id } } : node;
                }
                const image = node.metadata?.images?.find((item) => item.id === itemId);
                if (!image?.content) return node;
                const edge = Math.max(node.width, node.height);
                const size = node.metadata?.freeResize ? { width: node.width, height: node.height } : fitNodeSize(image.naturalWidth, image.naturalHeight, edge, edge);
                return {
                    ...node,
                    position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 },
                    ...size,
                    metadata: {
                        ...node.metadata,
                        content: image.content,
                        storageKey: image.storageKey,
                        naturalWidth: image.naturalWidth,
                        naturalHeight: image.naturalHeight,
                        bytes: image.bytes,
                        mimeType: image.mimeType,
                        primaryImageId: image.id,
                    },
                };
            }),
        );
    }, []);

    const duplicateBatchImage = useCallback((node: CanvasNodeData, imageId: string) => {
        const image = node.metadata?.images?.find((item) => item.id === imageId);
        if (!image?.content) return;
        const id = nanoid();
        const edge = Math.max(node.width, node.height);
        const size = fitNodeSize(image.naturalWidth, image.naturalHeight, edge, edge);
        const copy: CanvasNodeData = {
            id,
            type: CanvasNodeType.Image,
            title: node.title,
            position: { x: node.position.x + node.width * 2 + 96, y: node.position.y + node.height / 2 - size.height / 2 },
            ...size,
            metadata: {
                content: image.content,
                storageKey: image.storageKey,
                naturalWidth: image.naturalWidth,
                naturalHeight: image.naturalHeight,
                bytes: image.bytes,
                mimeType: image.mimeType,
                status: NODE_STATUS_SUCCESS,
                prompt: node.metadata?.prompt,
                generationType: node.metadata?.generationType,
                model: node.metadata?.model,
                size: node.metadata?.size,
                quality: node.metadata?.quality,
                background: node.metadata?.background,
                references: node.metadata?.references,
            },
        };
        setNodes((prev) => [...prev, copy]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt } } : node)));
    }, []);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node)));
    }, []);

    const downloadNodeImage = useCallback(async (node: CanvasNodeData) => {
        if (node.type === CanvasNodeType.Image) return downloadImage(node);
        if ((node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
        const mimeType = await canvasDownloadMimeType(node.metadata.content, node.metadata.mimeType);
        saveAs(node.metadata.content, canvasDownloadName(node.title || node.type, node.metadata.content, mimeType, node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? audioExtension(mimeType) : "png"));
    }, [downloadImage]);

    const downloadBatchImage = useCallback((node: CanvasNodeData, imageId: string) => downloadImage(node, imageId), [downloadImage]);
    const captureVideoNodeFrame = useCallback(
        async (nodeId: string, position: VideoFramePosition) => {
            setContextMenu(null);
            const node = nodesRef.current.find((item) => item.id === nodeId);
            const video = Array.from(containerRef.current!.querySelectorAll<HTMLVideoElement>("video[data-canvas-video]")).find((item) => item.dataset.canvasVideo === nodeId);
            if (node?.type !== CanvasNodeType.Video || !node.metadata?.content || !video) return message.error(t("canvas.videoFrames.failed"));
            try {
                const image = await uploadImage(await captureVideoFrame(node.metadata.content, position, video.currentTime));
                const size = fitNodeSize(image.width, image.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                const id = nanoid();
                const x = node.position.x + node.width + 96;
                let y = node.position.y + node.height / 2 - size.height / 2;
                while (nodesRef.current.some((item) => item.id !== node.id && item.position.x < x + size.width && item.position.x + item.width > x && item.position.y < y + size.height && item.position.y + item.height > y)) y += size.height + 24;
                const child: CanvasNodeData = {
                    id,
                    type: CanvasNodeType.Image,
                    title: t(`canvas.videoFrames.${position}Title`, { name: node.title || t("assets.kinds.video") }),
                    position: { x, y },
                    ...size,
                    metadata: imageMetadata(image),
                };
                setNodes((prev) => [...prev, child]);
                setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: id }]);
                setSelectedNodeIds(new Set([id]));
                setSelectedConnectionId(null);
                setDialogNodeId(id);
                message.success(t("canvas.videoFrames.captured"));
            } catch {
                message.error(t("canvas.videoFrames.failed"));
            }
        },
        [message, t],
    );

    const saveNodeAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Text) {
                const content = node.metadata?.content?.trim();
                if (!content) return message.error(t("canvas.projectPage.noTextToSave"));
                addAsset({ kind: "text", title: node.metadata?.prompt?.slice(0, 24) || t("canvas.projectPage.canvasText"), coverUrl: "", tags: [], source: "Canvas", data: { content }, metadata: { source: "canvas", nodeId: node.id } });
                message.success(t("common.addedToAssets"));
                return;
            }
            if (node.type === CanvasNodeType.Video) {
                if (!node.metadata?.content) return message.error(t("canvas.projectPage.noVideoToSave"));
                addAsset({
                    kind: "video",
                    title: node.metadata?.prompt?.slice(0, 24) || t("canvas.projectPage.canvasVideo"),
                    coverUrl: "",
                    tags: [],
                    source: "Canvas",
                    data: { url: node.metadata.content, storageKey: node.metadata.storageKey, width: node.width, height: node.height, bytes: node.metadata.bytes || 0, mimeType: node.metadata.mimeType || "video/mp4" },
                    metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
                });
                message.success(t("common.addedToAssets"));
                return;
            }
            if (!node.metadata?.content) return message.error(t("canvas.projectPage.noImageToSave"));
            const dataUrl = node.metadata.storageKey ? "" : node.metadata.content;
            addAsset({
                kind: "image",
                title: node.metadata?.prompt?.slice(0, 24) || t("canvas.projectPage.canvasImage"),
                coverUrl: node.metadata.content,
                tags: [],
                source: "Canvas",
                data: {
                    dataUrl,
                    storageKey: node.metadata.storageKey,
                    width: node.metadata.naturalWidth || node.width,
                    height: node.metadata.naturalHeight || node.height,
                    bytes: node.metadata.bytes || getDataUrlByteSize(dataUrl),
                    mimeType: node.metadata.mimeType || "image/png",
                },
                metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
            });
            message.success(t("common.addedToAssets"));
        },
        [addAsset, message, t],
    );

    const createImageReversePromptNodes = useCallback(
        (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image || !node.metadata?.content) {
                message.warning(t("canvas.projectPage.emptyReverse"));
                return;
            }

            const gap = 96;
            const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const configSpec = getNodeSpec("dxos:llm");
            const centerY = node.position.y + node.height / 2;
            const textNode = {
                ...createCanvasNode(CanvasNodeType.Text, { x: node.position.x + node.width + gap + textSpec.width / 2, y: centerY }, { content: t("canvas.projectPage.reversePreset"), prompt: t("canvas.projectPage.reversePreset"), status: NODE_STATUS_SUCCESS, fontSize: 20 }),
                title: t("canvas.projectPage.reverseTitle"),
            };
            const configNode = {
                ...createCanvasNode(
                    "dxos:llm",
                    { x: textNode.position.x + textNode.width + gap + configSpec.width / 2, y: centerY },
                    {
                        llmOutputMode: "text",
                        model: effectiveConfig.textModel || effectiveConfig.model || defaultConfig.textModel,
                    },
                ),
                title: "LLM 多模态分析 · 图片反推",
            };

            setNodes((prev) => [...prev, textNode, configNode]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: configNode.id }, { id: nanoid(), fromNodeId: textNode.id, toNodeId: configNode.id }]);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            setContextMenu(null);
        },
        [effectiveConfig.model, effectiveConfig.textModel, message, t],
    );

    const extractSelectionNode = useCallback(async (node: CanvasNodeData, rect: import("@/types/canvas").CanvasCropRect, ratio?: string) => {
        const { dataUrl, context } = await extractImageSelection(node, rect, ratio);
        const image = await uploadImage(dataUrl);
        const source = nodesRef.current.find((item) => item.id === node.id);
        if (!source || source.metadata?.storageKey !== node.metadata?.storageKey || source.metadata?.content !== node.metadata?.content) throw new Error("提取期间原图发生变化，请重新选择区域");
        const child: CanvasNodeData = {
            id: nanoid(), type: CanvasNodeType.Image, title: `${node.title || "图片"}-局部图`,
            position: { x: source.position.x + source.width + 40, y: source.position.y },
            ...fitNodeSize(image.width, image.height, 320, 360),
            metadata: { ...imageMetadata(image), cropContext: context },
        };
        setNodes((previous) => [...previous, child]);
        setSelectedNodeIds(new Set([child.id])); setSelectedConnectionId(null); setDialogNodeId(null); setExtractNodeId(null);
        message.success("已提取局部图，原图保持不变");
    }, [message]);

    const paintImageNode = useCallback(async (node: CanvasNodeData, dataUrl: string) => {
        const image = await uploadImage(dataUrl);
        const child: CanvasNodeData = {
            id: nanoid(), type: CanvasNodeType.Image, title: (node.title || "图片") + "-画笔",
            position: { x: node.position.x + node.width + 96, y: node.position.y },
            ...fitNodeSize(image.width, image.height, node.width, Math.max(node.width, node.height)),
            metadata: { ...imageMetadata(image), prompt: node.metadata?.prompt, cropContext: imageOutputCropContext([{ id: node.id }], nodesRef.current, connectionsRef.current) },
        };
        setNodes((previous) => [...previous, child]);
        setConnections((previous) => [...previous, { id: nanoid(), fromNodeId: node.id, toNodeId: child.id }]);
        setSelectedNodeIds(new Set([child.id])); setSelectedConnectionId(null); setDialogNodeId(null); setPaintNodeId(null);
        message.success("画笔图片已加入画布，原图已保留");
    }, [message]);

    const cropImageNode = useCallback(async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
        if (!node.metadata?.content) return;
        const cropped = await cropDataUrl(node.metadata.content, crop);
        const image = await uploadImage(cropped);
        const width = Math.min(node.width, Math.max(220, image.width));
        const childId = nanoid();
        const child: CanvasNodeData = {
            id: childId,
            type: CanvasNodeType.Image,
            title: `${node.title || "图片"}-${crop.x < 0 || crop.y < 0 || crop.x + crop.width > 1 || crop.y + crop.height > 1 ? "裁剪扩图" : "裁剪"}`,
            position: { x: node.position.x + node.width + 96, y: node.position.y },
            width,
            height: width * (image.height / image.width),
            metadata: {
                ...imageMetadata(image),
                cropContext: { full: true },
                prompt: node.metadata?.prompt,
            },
        };
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
        setSelectedNodeIds(new Set([childId]));
        setDialogNodeId(childId);
        setExtractNodeId(null);
        setCropNodeId(null);
    }, []);

    const splitImageNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
            if (!node.metadata?.content) return;
            const pieces = await splitDataUrl(node.metadata.content, params);
            const gap = 16;
            const columns = Array.from({ length: params.columns }, (_, column) => pieces.find((piece) => piece.column === column)?.width || 0);
            const rows = Array.from({ length: params.rows }, (_, row) => pieces.find((piece) => piece.row === row)?.height || 0);
            const source = await readImageMeta(node.metadata.content);
            const scale = node.width / source.width;
            const columnLeft = (column: number) => columns.slice(0, column).reduce((sum, width) => sum + (width ? width * scale + gap : 0), 0);
            const rowTop = (row: number) => rows.slice(0, row).reduce((sum, height) => sum + (height ? height * scale + gap : 0), 0);
            const startX = node.position.x + node.width + 96;
            const startY = node.position.y;
            const childNodes = await Promise.all(
                pieces.map(async (piece) => {
                    const image = await uploadImage(piece.dataUrl);
                    const id = nanoid();
                    return {
                        id,
                        type: CanvasNodeType.Image,
                        title: t("canvas.projectPage.splitTitle", { name: node.title || t("assets.kinds.image"), row: piece.row + 1, column: piece.column + 1 }),
                        position: { x: startX + columnLeft(piece.column), y: startY + rowTop(piece.row) },
                        width: piece.width * scale,
                        height: piece.height * scale,
                        metadata: {
                            ...imageMetadata(image),
                            cropContext: { full: true },
                            prompt: node.metadata?.prompt,
                        },
                    } satisfies CanvasNodeData;
                }),
            );
            setSplitNodeId(null);
            setNodes((prev) => [...prev, ...childNodes]);
            setConnections((prev) => [...prev, ...childNodes.map((child) => ({ id: nanoid(), fromNodeId: node.id, toNodeId: child.id }))]);
            setSelectedNodeIds(new Set(childNodes.map((child) => child.id)));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            message.success(t("canvas.projectPage.splitSuccess", { count: childNodes.length }));
        },
        [message, t],
    );

    const maskEditImageNode = useCallback(
        async (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1", size: node.metadata?.size || "auto" };
            if (payload.generate && !isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const userPrompt = payload.prompt.trim();
            const prompt = t("canvas.projectPage.maskPrompt", { source: imageReferenceLabel(0), mask: imageReferenceLabel(1), prompt: userPrompt });
            setMaskEditNodeId(null);
            const maskImage = await uploadImage(payload.maskDataUrl);
            const maskNodeId = nanoid();
            const childId = nanoid();
            const source = { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey };
            const maskSource = { id: maskNodeId, name: "mask.png", type: maskImage.mimeType || "image/png", dataUrl: maskImage.url, storageKey: maskImage.storageKey };
            const references = [source, maskSource];
            const generationMetadata = { ...buildImageGenerationMetadata("edit", generationConfig, 1, references), cropContext: imageOutputCropContext([source], nodesRef.current, connectionsRef.current) };
            const childMetadata = payload.generate ? { prompt, status: NODE_STATUS_LOADING, ...generationMetadata } : { prompt, cropContext: generationMetadata.cropContext };
            setNodes((prev) => [
                ...prev,
                {
                    id: maskNodeId,
                    type: CanvasNodeType.Image,
                    title: t("canvas.projectPage.maskNodeTitle"),
                    position: { x: node.position.x, y: node.position.y + node.height + 96 },
                    width: node.width,
                    height: node.height,
                    metadata: { ...imageMetadata(maskImage), cropContext: { full: true } },
                },
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title: userPrompt.slice(0, 32) || t("canvas.projectPage.maskResult"),
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: node.width,
                    height: node.height,
                    metadata: childMetadata,
                },
            ]);
            setConnections((prev) => [
                ...prev,
                { id: nanoid(), fromNodeId: node.id, toNodeId: childId },
                { id: nanoid(), fromNodeId: maskNodeId, toNodeId: childId },
            ]);
            setSelectedNodeIds(new Set([childId]));
            setSelectedConnectionId(null);
            setDialogNodeId(childId);
            if (!payload.generate) return;
            setRunningNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                const image = await requestEdit(generationConfig, prompt, references, { signal: controller.signal }).then((items) => items[0]);
                const uploaded = await uploadImage(image.dataUrl, { signal: controller.signal });
                const size = fitNodeSize(uploaded.width, uploaded.height, node.width, node.height);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), prompt, ...generationMetadata } } : item)));
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.maskFailed");
                recordDiagnostic("画布任务", error, { projectId });
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest, t],
    );

    const upscaleImageNode = useCallback(async (node: CanvasNodeData, params: CanvasImageUpscaleParams) => {
        if (!node.metadata?.content) return;
        setUpscaleNodeId(null);
        const upscaled = await upscaleDataUrl(node.metadata.content, params);
        const image = await uploadImage(upscaled);
        const size = fitNodeSize(image.width, image.height);
        const childId = nanoid();
        const child: CanvasNodeData = {
            id: childId,
            type: CanvasNodeType.Image,
            title: "Upscaled Image",
            position: { x: node.position.x + node.width + 96, y: node.position.y },
            width: size.width,
            height: size.height,
            metadata: {
                ...imageMetadata(image),
                cropContext: imageOutputCropContext([{ id: node.id }], nodesRef.current, connectionsRef.current),
                prompt: node.metadata?.prompt,
            },
        };
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
        setSelectedNodeIds(new Set([childId]));
        setDialogNodeId(childId);
    }, []);

    const generateAngleNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const childId = nanoid();
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const title = buildAngleLabel(params);
            const prompt = buildAnglePrompt(params);
            const generationMetadata = { ...buildImageGenerationMetadata("edit", generationConfig, 1, [
                { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey },
            ]), cropContext: imageOutputCropContext([{ id: node.id }], nodesRef.current, connectionsRef.current) };
            setAngleNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title,
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: imageConfig.width,
                    height: imageConfig.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setDialogNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                const image = await requestEdit(
                    generationConfig,
                    prompt,
                    [{ id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey }],
                    { signal: controller.signal },
                ).then((items) => items[0]);
                const uploaded = await uploadImage(image.dataUrl, { signal: controller.signal });
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, ...generatedImageNodeSize(uploaded.width, uploaded.height, item), metadata: { ...item.metadata, ...imageMetadata(uploaded), prompt, ...generationMetadata } } : item)));
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
                recordDiagnostic("画布任务", error, { projectId });
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, openConfigDialog, startGenerationRequest, t],
    );

    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
    }, []);

    const handleUploadRequest = useCallback((nodeId?: string, position?: Position) => {
        uploadTargetRef.current = { nodeId, position };
        imageInputRef.current?.click();
    }, []);

    const handleImageInputChange = useCallback(
        async (event: ReactChangeEvent<HTMLInputElement>) => {
            const files = Array.from(event.target.files || []).filter(
                (f) => f.type.startsWith("image/") || f.type.startsWith("video/") || isAudioFile(f),
            );
            if (!files.length) {
                uploadTargetRef.current = null;
                event.target.value = "";
                return;
            }

            const target = uploadTargetRef.current;
            const basePosition =
                target?.position ||
                screenToCanvas(
                    (containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2,
                    (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2,
                );
            const STAGGER = 40; // Offset between multiple imported files.

            // When replacing a target node, use the first file as the replacement and create the rest nearby.
            if (target?.nodeId) {
                const [first, ...rest] = files;

                // Replace the target node with the first file.
                if (isAudioFile(first)) {
                    const audio = await uploadMediaFile(first, "audio");
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Audio,
                                      title: first.name,
                                      position: { x: node.position.x + node.width / 2 - spec.width / 2, y: node.position.y + node.height / 2 - spec.height / 2 },
                                      width: spec.width,
                                      height: spec.height,
                                      metadata: { ...node.metadata, ...audioMetadata(audio), errorDetails: undefined },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                } else if (first.type.startsWith("video/")) {
                    const video = await uploadMediaFile(first, "video");
                    const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Video,
                                      title: first.name,
                                      position: { x: node.position.x + node.width / 2 - nextSize.width / 2, y: node.position.y + node.height / 2 - nextSize.height / 2 },
                                      width: nextSize.width,
                                      height: nextSize.height,
                                      metadata: { ...node.metadata, ...videoMetadata(video), errorDetails: undefined },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                } else {
                    const image = await uploadImage(first);
                    const s = fitNodeSize(image.width, image.height);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Image,
                                      title: first.name,
                                      width: s.width,
                                      height: s.height,
                                      metadata: {
                                          ...node.metadata,
                                          ...imageMetadata(image),
                                          errorDetails: undefined,
                                          freeResize: false,
                                          imageSizeManual: false,
                                          cropContext: { full: true },
                                          images: undefined,
                                          generationType: undefined,
                                          model: undefined,
                                          size: undefined,
                                          quality: undefined,
                                          count: undefined,
                                          references: undefined,
                                          primaryImageId: undefined,
                                      },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                }

                // Create the remaining files near the target node.
                for (let i = 0; i < rest.length; i++) {
                    const offsetPos = { x: basePosition.x + (i + 1) * STAGGER, y: basePosition.y + (i + 1) * STAGGER };
                    const f = rest[i];
                    if (isAudioFile(f)) {
                        void createAudioFileNode(f, offsetPos);
                    } else if (f.type.startsWith("video/")) {
                        void createVideoFileNode(f, offsetPos);
                    } else {
                        void createImageFileNode(f, offsetPos);
                    }
                }
            } else {
                // Without a replacement target, create all files near the canvas center.
                for (let i = 0; i < files.length; i++) {
                    const offsetPos = { x: basePosition.x + i * STAGGER, y: basePosition.y + i * STAGGER };
                    const f = files[i];
                    if (isAudioFile(f)) {
                        void createAudioFileNode(f, offsetPos);
                    } else if (f.type.startsWith("video/")) {
                        void createVideoFileNode(f, offsetPos);
                    } else {
                        void createImageFileNode(f, offsetPos);
                    }
                }
            }

            uploadTargetRef.current = null;
            event.target.value = "";
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, screenToCanvas, size.height, size.width],
    );

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const files = Array.from(event.dataTransfer.files).filter(
                (item) => item.type.startsWith("image/") || item.type.startsWith("video/") || isAudioFile(item),
            );
            if (!files.length) return;

            const basePos = screenToCanvas(event.clientX, event.clientY);
            const images = files.filter((file) => file.type.startsWith("image/"));
            if (images.length > 1) {
                void createDroppedImageGrid(images, basePos);
                // Other media retain their own import behavior, outside the image grid.
                files.filter((file) => !file.type.startsWith("image/")).forEach((file, index) => {
                    const position = { x: basePos.x - 720, y: basePos.y + index * 400 };
                    if (isAudioFile(file)) void createAudioFileNode(file, position); else void createVideoFileNode(file, position);
                });
                return;
            }
            const STAGGER = 40;
            for (let i = 0; i < files.length; i++) {
                const pos = { x: basePos.x + i * STAGGER, y: basePos.y + i * STAGGER };
                const f = files[i];
                if (isAudioFile(f)) {
                    void createAudioFileNode(f, pos);
                } else if (f.type.startsWith("video/")) {
                    void createVideoFileNode(f, pos);
                } else {
                    void createImageFileNode(f, pos);
                }
            }
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, createDroppedImageGrid, screenToCanvas],
    );

    const startTitleEditing = useCallback(() => {
        setTitleDraft(currentProject?.title || t("canvas.projectPage.untitledCanvas"));
        setTitleEditing(true);
    }, [currentProject?.title, t]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) renameProject(projectId, nextTitle);
        setTitleEditing(false);
    }, [projectId, renameProject, titleDraft]);

    const handleGenerateNode = useCallback(
        async (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string, signal?: AbortSignal) => {
            if (signal?.aborted) throw new DOMException("生成已停止", "AbortError");
            const project = generationProjectRef.current;
            let runController: AbortController | undefined;
            const ownsRun = () => project.alive && generationProjectRef.current === project && (!runController || generationOwnersRef.current.get(nodeId)?.controller === runController);
            const active = () => ownsRun() && !runController?.signal.aborted && !signal?.aborted;
            const assertActive = () => { if (!active()) throw new DOMException("生成已停止或画布已切换", "AbortError"); };
            const cancel = () => {
                runController?.abort();
                const affected = new Set<string>();
                generationRequestsRef.current.forEach((request, id) => { if (request.controller === runController) { affected.add(id); generationRequestsRef.current.delete(id); } });
                if (ownsRun()) {
                    setNodes((previous) => ownsRun() ? previous.map((node) => affected.has(node.id) && node.metadata?.status === NODE_STATUS_LOADING ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined, images: node.metadata.images?.map((image) => image.status === NODE_STATUS_LOADING ? { ...image, status: NODE_STATUS_ERROR, errorDetails: t("common.requestCanceled") } : image), texts: node.metadata.texts?.map((text) => text.status === NODE_STATUS_LOADING ? { ...text, status: NODE_STATUS_ERROR, errorDetails: t("common.requestCanceled") } : text) } } : node) : previous);
                    setRunningNodeId((current) => ownsRun() && current === nodeId ? null : current);
                }
            };
            const beginRun = () => { assertActive(); runController = startGenerationRequest(nodeId, nodeId, nodeId); signal?.addEventListener("abort", cancel, { once: true }); return runController; };
            const endRun = () => { signal?.removeEventListener("abort", cancel); if (runController) finishGenerationRequest(nodeId, runController); };
            const updateNodes = guardGenerationSetter(setNodes, active);
            const updateConnections = guardGenerationSetter(setConnections, active);
            const updateRunningNodeId = guardGenerationSetter(setRunningNodeId, active);
            const updateSelectedNodeIds = guardGenerationSetter(setSelectedNodeIds, active);
            const updateSelectedConnectionId = guardGenerationSetter(setSelectedConnectionId, active);
            const updateDialogNodeId = guardGenerationSetter(setDialogNodeId, active);
            const updateExpandedBatchNodeIds = guardGenerationSetter(setExpandedBatchNodeIds, active);
            assertActive();
            let sourceNode = nodesRef.current.find((node) => node.id === nodeId);
            const generationConfig = buildGenerationConfig(effectiveConfig, sourceNode, mode);
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const originalSourceNode = sourceNode;
            const branch = createGenerationBranch(sourceNode, nodesRef.current, connectionsRef.current, generationConfig, mode, prompt);
            if (branch) {
                // Publish refs synchronously before resolving context; React may defer its state update.
                nodesRef.current = [...nodesRef.current, branch.node];
                connectionsRef.current = [...connectionsRef.current, ...branch.connections];
                setNodes(nodesRef.current);
                setConnections(connectionsRef.current);
                nodeId = branch.node.id;
                sourceNode = branch.node;
                setSelectedNodeIds(new Set([nodeId]));
                setSelectedConnectionId(null);
                setDialogNodeId(nodeId);
            }

            // useBuiltinPanel.writeBackToSelf reuses built-in generation while writing the result back to the plugin node.
            // Image mode currently supports display-only nodes such as panoramas, with a useBuiltinPanel.promptPrefix.
            const builtinPanel = sourceNode ? getNodeDefinition(sourceNode.type)?.useBuiltinPanel : undefined;
            if (sourceNode && builtinPanel?.writeBackToSelf && builtinPanel.mode === "image") {
                const scene = prompt.trim();
                if (!scene) return;
                const controller = beginRun();
                updateRunningNodeId(nodeId);
                updateNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt: scene, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)));
                try {
                    const fullPrompt = (builtinPanel.promptPrefix || "") + scene;
                    const context = await hydrateNodeGenerationContext(buildNodeGenerationContext(nodeId, nodesRef.current, connectionsRef.current, fullPrompt));
                    assertActive();
                    const refs = context.referenceImages;
                    const cropContext = imageOutputCropContext(refs, nodesRef.current, connectionsRef.current);
                    const image = refs.length
                        ? await requestEdit({ ...generationConfig, count: "1" }, context.prompt, refs, { signal: controller.signal }).then((items) => items[0])
                        : await requestGeneration({ ...generationConfig, count: "1" }, context.prompt, { signal: controller.signal }).then((items) => items[0]);
                    assertActive();
                    const uploaded = await uploadImage(image.dataUrl, { signal: controller.signal });
                    assertActive();
                    updateNodes((prev) =>
                        prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...imageMetadata(uploaded), cropContext, prompt: scene, model: generationConfig.model, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)),
                    );
                    updateDialogNodeId(null);
                } catch (error) {
                    if (active() && !isGenerationCanceled(error)) {
                        const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
                recordDiagnostic("画布任务", error, { projectId });
                        message.error(errorDetails);
                        updateNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                    }
                } finally {
                    updateRunningNodeId((current) => current === nodeId ? null : current);
                    endRun();
                }
                return;
            }

            const controllerForRun = beginRun();
            updateRunningNodeId(nodeId);
            const sourceTextContent = sourceNode?.type === CanvasNodeType.Text ? sourceNode.metadata?.content?.trim() || "" : "";
            const editingTextNode = mode === "text" && Boolean(sourceTextContent);
            let pendingChildIds: string[] = [];
            let markSourceStatus = Boolean(branch);
            try {
                const context = buildNodeGenerationContext(nodeId, nodesRef.current, connectionsRef.current, editingTextNode ? t("canvas.projectPage.editTextPrompt", { source: sourceTextContent, prompt }) : prompt);
                if (branch && originalSourceNode) {
                    // Prefer current direct inputs; Config-generated outputs also retain their original multimodal inputs.
                    const configSource = findRetrySourceNode(originalSourceNode.id, nodesRef.current, connectionsRef.current);
                    const inputSource = configSource || originalSourceNode;
                    const inheritedContext = buildNodeGenerationContext(inputSource.id, nodesRef.current, connectionsRef.current, inputSource.metadata?.composerContent ?? inputSource.metadata?.prompt ?? "");
                    if (!context.referenceImages.length) context.referenceImages = branch.savedImageInputs ? (await resolveMetadataReferences(originalSourceNode.metadata!) ?? inheritedContext.referenceImages) : inheritedContext.referenceImages;
                    else if (!branch.savedImageInputs) context.referenceImages = [...new Map([...context.referenceImages, ...inheritedContext.referenceImages].map((image) => [image.id, image])).values()];
                    if (!context.referenceVideos.length) context.referenceVideos = inheritedContext.referenceVideos;
                    if (!context.referenceAudios.length) context.referenceAudios = inheritedContext.referenceAudios;
                    context.imageCount = context.referenceImages.length;
                    context.videoCount = context.referenceVideos.length;
                    context.audioCount = context.referenceAudios.length;
                    // Only unchanged, already-expanded prompts skip upstream text; new edits still receive direct text inputs.
                    if (prompt === originalSourceNode.metadata?.prompt) context.prompt = prompt;
                    else if (configSource && !context.textCount && inheritedContext.textCount) {
                        const textStart = inheritedContext.prompt.indexOf("\n\n【");
                        if (textStart >= 0) context.prompt += inheritedContext.prompt.slice(textStart);
                    }
                    if (originalSourceNode.metadata?.generationType === "edit" && !context.referenceImages.length) throw new Error(t("canvas.projectPage.referenceMissing"));
                }
                const generationContext = await hydrateNodeGenerationContext(context);
                const effectivePrompt = generationContext.prompt.trim();
                if (!active()) {
                    endRun();
                    updateRunningNodeId((current) => current === nodeId ? null : current);
                    return;
                }
                markSourceStatus = Boolean(branch) || (sourceNode?.type !== CanvasNodeType.Image && !editingTextNode);
                if (!effectivePrompt && (mode === "text" || mode === "audio")) {
                    endRun();
                    updateRunningNodeId((current) => current === nodeId ? null : current);
                    return;
                }
                if (markSourceStatus) updateNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...(node.type === CanvasNodeType.Config ? {} : { prompt }), status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)));

                if (mode === "image") {
                    const count = getGenerationCount(generationConfig.count);
                    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                    const isImageNode = sourceNode?.type === CanvasNodeType.Image;
                    const isEmptyImageNode = isImageNode && !sourceNode?.metadata?.content;
                    const reuseImageNode = isImageNode && isEmptyImageNode;
                    const sourceReference =
                        isImageNode && sourceNode?.metadata?.content
                            ? [{ id: sourceNode.id, name: `${sourceNode.title || sourceNode.id}.png`, type: sourceNode.metadata.mimeType || "image/png", dataUrl: sourceNode.metadata.content, storageKey: sourceNode.metadata.storageKey }]
                            : [];
                    const referenceImages = [...new Map([...sourceReference, ...generationContext.referenceImages].map((image) => [image.id, image])).values()];
                    const generationType = referenceImages.length ? ("edit" as const) : ("generation" as const);
                    const generationMetadata = { ...buildImageGenerationMetadata(generationType, generationConfig, count, referenceImages), imageCompressionEnabled: sourceNode?.metadata?.imageCompressionEnabled, imageCompressionResolution: sourceNode?.metadata?.imageCompressionResolution, imageCompressionMaxMb: sourceNode?.metadata?.imageCompressionMaxMb, cropContext: imageOutputCropContext(referenceImages, nodesRef.current, connectionsRef.current, originalSourceNode) };
                    const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : isImageNode ? CanvasNodeType.Image : CanvasNodeType.Text];
                    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                    const placeholderSize = nodeSizeFromRatio(generationConfig.size, imageConfig.width, imageConfig.height) || imageConfig;
                    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                    const rootId = reuseImageNode ? nodeId : nanoid();
                    const imageIds = Array.from({ length: count }, () => nanoid());
                    pendingChildIds = [rootId];
                    const resultPosition = {
                        x: reuseImageNode ? parentPosition.x : parentPosition.x + (sourceNode?.width || parentConfig.width) + 96,
                        y: parentPosition.y + (sourceNode?.height || parentConfig.height) / 2 - placeholderSize.height / 2,
                    };
                    if (!reuseImageNode) {
                        const obstacles = nodesRef.current.filter((node) => node.type !== CanvasNodeType.Group && node.position.x < resultPosition.x + placeholderSize.width + 32 && node.position.x + node.width + 32 > resultPosition.x).sort((a, b) => a.position.y - b.position.y);
                        for (const node of obstacles) if (resultPosition.y < node.position.y + node.height + 64 && resultPosition.y + placeholderSize.height + 64 > node.position.y) resultPosition.y = node.position.y + node.height + 64;
                    }
                    const rootNode: CanvasNodeData = {
                        id: rootId,
                        type: CanvasNodeType.Image,
                        title: branch ? sourceNode!.title : effectivePrompt.slice(0, 32) || "Generated Image",
                        position: resultPosition,
                        width: reuseImageNode && (sourceNode?.metadata?.imageSizeManual || sourceNode?.metadata?.freeResize) ? sourceNode.width : placeholderSize.width,
                        height: reuseImageNode && (sourceNode?.metadata?.imageSizeManual || sourceNode?.metadata?.freeResize) ? sourceNode.height : placeholderSize.height,
                        metadata: {
                            prompt: effectivePrompt,
                            status: NODE_STATUS_LOADING,
                            images: imageIds.map((id) => ({ id, status: NODE_STATUS_LOADING, content: "", naturalWidth: 0, naturalHeight: 0, bytes: 0, mimeType: "" })),
                            primaryImageId: undefined,
                            ...generationMetadata,
                        },
                    };

                    updateNodes((prev) => [
                        ...prev.map((node) =>
                            node.id === nodeId
                                ? isConfigNode
                                    ? {
                                          ...node,
                                          metadata: { ...node.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined },
                                      }
                                    : reuseImageNode
                                      ? {
                                            ...node,
                                            position: rootNode.position,
                                            width: rootNode.width,
                                            height: rootNode.height,
                                            title: rootNode.title,
                                            metadata: { ...node.metadata, ...rootNode.metadata, content: undefined, storageKey: undefined, naturalWidth: undefined, naturalHeight: undefined, bytes: undefined, mimeType: undefined, errorDetails: undefined },
                                        }
                                      : isImageNode
                                        ? {
                                              ...node,
                                              metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined },
                                          }
                                        : {
                                              ...node,
                                              type: CanvasNodeType.Text,
                                              title: prompt.slice(0, 32) || "Prompt",
                                              width: parentConfig.width,
                                              height: parentConfig.height,
                                              metadata: { ...node.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS, fontSize: 20, errorDetails: undefined },
                                          }
                                : node,
                        ),
                        ...(reuseImageNode ? [] : [rootNode]),
                    ]);
                    if (!reuseImageNode) updateConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]);
                    updateSelectedNodeIds(new Set([nodeId]));
                    updateSelectedConnectionId(null);
                    updateDialogNodeId(nodeId);

                    const controller = rootId === nodeId ? controllerForRun : startGenerationRequest(rootId, nodeId, nodeId, controllerForRun);
                    let hasSuccess = false;
                    let hasFailure = false;
                    let firstError = "";
                    await Promise.all(
                        imageIds.map(async (imageId) => {
                            try {
                                const image = referenceImages.length
                                    ? await requestEdit({ ...generationConfig, count: "1" }, effectivePrompt, referenceImages, { signal: controller.signal, imageCompression: sourceNode?.metadata }).then((items) => items[0])
                                    : await requestGeneration({ ...generationConfig, count: "1" }, effectivePrompt, { signal: controller.signal }).then((items) => items[0]);
                                assertActive();
                    const uploaded = await uploadImage(image.dataUrl, { signal: controller.signal });
                    assertActive();
                                const item: CanvasNodeImage = { id: imageId, status: NODE_STATUS_SUCCESS, content: uploaded.url, storageKey: uploaded.storageKey, naturalWidth: uploaded.width, naturalHeight: uploaded.height, bytes: uploaded.bytes, mimeType: uploaded.mimeType };
                                updateNodes((prev) =>
                                    prev.map((node) => {
                                        if (node.id !== rootId) return node;
                                        const images = node.metadata?.images?.map((image) => (image.id === imageId ? item : image)) || [];
                                        if (node.metadata?.primaryImageId) return { ...node, metadata: { ...node.metadata, images } };
                                        const imageSize = generatedImageNodeSize(uploaded.width, uploaded.height, node, Boolean(reuseImageNode && sourceNode?.metadata?.content));
                                        return {
                                            ...node,
                                            ...imageSize,
                                            metadata: {
                                                ...node.metadata,
                                                content: item.content,
                                                storageKey: item.storageKey,
                                                naturalWidth: item.naturalWidth,
                                                naturalHeight: item.naturalHeight,
                                                bytes: item.bytes,
                                                mimeType: item.mimeType,
                                                images,
                                                primaryImageId: imageId,
                                            },
                                        };
                                    }),
                                );
                                hasSuccess = true;
                                if (isConfigNode) updateNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)));
                                return true;
                            } catch (error) {
                                if (!active() || isGenerationCanceled(error)) return false;
                                const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
                recordDiagnostic("画布任务", error, { projectId });
                                if (!firstError) firstError = errorDetails;
                                hasFailure = true;
                                updateNodes((prev) => prev.map((node) => (node.id === rootId ? { ...node, metadata: { ...node.metadata, images: node.metadata?.images?.map((image) => (image.id === imageId ? { ...image, status: NODE_STATUS_ERROR, errorDetails } : image)) } } : node)));
                            }
                            return false;
                        }),
                    );
                    if (rootId !== nodeId) finishGenerationRequest(rootId, controller);
                    if (!active()) {
                        updateNodes((prev) => prev.map((node) => (node.id === nodeId && isConfigNode && node.metadata?.status === NODE_STATUS_LOADING ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined } } : node)));
                        return;
                    }
                    if (hasFailure) {
                        message.error(hasSuccess ? t("canvas.projectPage.partialFailed") : firstError || t("canvas.projectPage.generationFailed"));
                    }
                    updateNodes((prev) =>
                        prev.map((node) =>
                            node.id === nodeId && isConfigNode
                                ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : t("canvas.projectPage.generationFailed") } }
                                : node.id === rootId
                                  ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : t("canvas.projectPage.allFailed") } }
                                    : node,
                        ),
                    );
                    return rootId;
                }

                if (mode === "video") {
                    const spec = nodeSizeFromRatio(generationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                    const isEmptyVideoNode = sourceNode?.type === CanvasNodeType.Video && !sourceNode.metadata?.content;
                    const reuseVideoNode = sourceNode?.type === CanvasNodeType.Video && isEmptyVideoNode;
                    const videoId = reuseVideoNode ? nodeId : nanoid();
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const videoNode: CanvasNodeData = {
                        id: videoId,
                        type: CanvasNodeType.Video,
                        title: branch ? sourceNode!.title : effectivePrompt.slice(0, 32) || "Generated Video",
                        position: reuseVideoNode ? sourceNode!.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y },
                        width: reuseVideoNode ? sourceNode!.width : spec.width,
                        height: reuseVideoNode ? sourceNode!.height : spec.height,
                        metadata: {
                            prompt: effectivePrompt,
                            status: NODE_STATUS_LOADING,
                            model: generationConfig.model,
                            size: generationConfig.size,
                            seconds: generationConfig.videoSeconds,
                            vquality: generationConfig.vquality,
                            generateAudio: generationConfig.videoGenerateAudio,
                            watermark: generationConfig.videoWatermark,
                            videoMode: generationConfig.videoMode,
                            references: generationReferenceUrls(generationContext),
                        },
                    };
                    pendingChildIds = [videoId];
                    updateNodes((prev) =>
                        reuseVideoNode
                            ? prev.map((node) => (node.id === nodeId ? { ...node, ...videoNode, metadata: { ...node.metadata, ...videoNode.metadata } } : node))
                            : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), videoNode],
                    );
                    if (!reuseVideoNode) updateConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: videoId }]);
                    const controller = startGenerationRequest(videoId, nodeId, nodeId, controllerForRun);
                    try {
                        await completeVideoNodeTask(videoId, generationConfig, effectivePrompt, generationContext.referenceImages, controller.signal, {
                            size: generationConfig.size,
                            seconds: generationConfig.videoSeconds,
                            vquality: generationConfig.vquality,
                            generateAudio: generationConfig.videoGenerateAudio,
                            watermark: generationConfig.videoWatermark,
                            videoMode: generationConfig.videoMode,
                            references: generationReferenceUrls(generationContext),
                        }, generationContext.referenceVideos, generationContext.referenceAudios);
                    } finally {
                        finishGenerationRequest(videoId, controller);
                    }
                    return videoId;
                }

                if (mode === "audio") {
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    const isEmptyAudioNode = sourceNode?.type === CanvasNodeType.Audio && !sourceNode.metadata?.content;
                    const reuseAudioNode = sourceNode?.type === CanvasNodeType.Audio && isEmptyAudioNode;
                    const audioId = reuseAudioNode ? nodeId : nanoid();
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const audioNode: CanvasNodeData = {
                        id: audioId,
                        type: CanvasNodeType.Audio,
                        title: branch ? sourceNode!.title : effectivePrompt.slice(0, 32) || "Generated Audio",
                        position: reuseAudioNode ? sourceNode!.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y + ((sourceNode?.height || spec.height) - spec.height) / 2 },
                        width: reuseAudioNode ? sourceNode!.width : spec.width,
                        height: reuseAudioNode ? sourceNode!.height : spec.height,
                        metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, ...buildAudioGenerationMetadata(generationConfig) },
                    };
                    pendingChildIds = [audioId];
                    updateNodes((prev) =>
                        reuseAudioNode
                            ? prev.map((node) => (node.id === nodeId ? { ...node, ...audioNode, metadata: { ...node.metadata, ...audioNode.metadata } } : node))
                            : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), audioNode],
                    );
                    if (!reuseAudioNode) updateConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: audioId }]);
                    const controller = startGenerationRequest(audioId, nodeId, nodeId, controllerForRun);
                    try {
                        const result = await requestAudioGeneration(generationConfig, effectivePrompt, { signal: controller.signal });
                        assertActive();
                        const audio = await storeGeneratedAudio(result, generationConfig.audioFormat);
                        assertActive();
                        updateNodes((prev) => prev.map((node) => (node.id === audioId ? { ...node, metadata: { ...node.metadata, ...audioMetadata(audio), prompt: effectivePrompt, ...buildAudioGenerationMetadata(generationConfig) } } : node)));
                    } finally {
                        finishGenerationRequest(audioId, controller);
                    }
                    return audioId;
                }

                const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                const textCount = getGenerationCount(String(sourceNode?.metadata?.textCount || 1));
                const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : CanvasNodeType.Text];
                const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
                const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                const isEmptyTextNode = sourceNode?.type === CanvasNodeType.Text && !sourceTextContent;
                const reuseTextNode = sourceNode?.type === CanvasNodeType.Text && isEmptyTextNode;
                const rootId = reuseTextNode ? nodeId : nanoid();
                const textIds = Array.from({ length: textCount }, () => nanoid());
                const rootNode: CanvasNodeData = {
                    id: rootId,
                    type: CanvasNodeType.Text,
                    title: branch ? sourceNode!.title : effectivePrompt.slice(0, 32) || "Generated Text",
                    position: reuseTextNode ? sourceNode!.position : { x: parentPosition.x + parentConfig.width + 96, y: parentPosition.y + parentConfig.height / 2 - textConfig.height / 2 },
                    width: reuseTextNode ? sourceNode!.width : textConfig.width,
                    height: reuseTextNode ? sourceNode!.height : textConfig.height,
                    metadata: {
                        prompt: effectivePrompt,
                        status: NODE_STATUS_LOADING,
                        fontSize: sourceNode?.metadata?.fontSize || 20,
                        model: generationConfig.model,
                        reasoningEffort: generationConfig.reasoningEffort,
                        textCount,
                        texts: textIds.map((id) => ({ id, status: NODE_STATUS_LOADING, content: "" })),
                        primaryTextId: textIds[0],
                    },
                };
                pendingChildIds = [rootId];
                updateNodes((prev) =>
                    reuseTextNode
                        ? prev.map((node) => (node.id === nodeId ? { ...node, ...rootNode, metadata: { ...node.metadata, ...rootNode.metadata } } : node))
                        : [...prev.map((node) => (node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)), rootNode],
                );
                if (!reuseTextNode) updateConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]);
                updateSelectedNodeIds(new Set([nodeId]));
                updateSelectedConnectionId(null);
                updateDialogNodeId(nodeId);

                const controller = rootId === nodeId ? controllerForRun : startGenerationRequest(rootId, nodeId, nodeId, controllerForRun);
                const results = await Promise.all(
                    textIds.map(async (textId): Promise<CanvasNodeText | null> => {
                        let streamed = "";
                        try {
                            const answer = await requestImageQuestion(
                                generationConfig,
                                buildNodeResponseMessages({ ...generationContext, prompt: effectivePrompt }),
                                (text) => {
                                    streamed = text;
                                    updateNodes((prev) =>
                                        prev.map((node) =>
                                            node.id === rootId
                                                ? {
                                                      ...node,
                                                      metadata: {
                                                          ...node.metadata,
                                                          ...(node.metadata?.primaryTextId === textId ? { content: text } : {}),
                                                          texts: node.metadata?.texts?.map((item) => (item.id === textId ? { ...item, content: text } : item)),
                                                      },
                                                  }
                                                : node,
                                        ),
                                    );
                                },
                                { signal: controller.signal },
                            );
                            assertActive();
                            const content = answer || streamed;
                            updateNodes((prev) =>
                                prev.map((node) =>
                                    node.id === rootId
                                        ? {
                                              ...node,
                                              metadata: {
                                                  ...node.metadata,
                                                  ...(node.metadata?.primaryTextId === textId ? { content } : {}),
                                                  texts: node.metadata?.texts?.map((item) => (item.id === textId ? { ...item, content, status: NODE_STATUS_SUCCESS } : item)),
                                              },
                                          }
                                        : node,
                                ),
                            );
                            return { id: textId, status: NODE_STATUS_SUCCESS, content } satisfies CanvasNodeText;
                        } catch (error) {
                            if (!active() || isGenerationCanceled(error)) return null;
                            const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
                recordDiagnostic("画布任务", error, { projectId });
                            updateNodes((prev) => prev.map((node) => (node.id === rootId ? { ...node, metadata: { ...node.metadata, texts: node.metadata?.texts?.map((item) => (item.id === textId ? { ...item, status: NODE_STATUS_ERROR, errorDetails } : item)) } } : node)));
                            return { id: textId, status: NODE_STATUS_ERROR, content: "", errorDetails } satisfies CanvasNodeText;
                        }
                    }),
                );
                if (rootId !== nodeId) finishGenerationRequest(rootId, controller);
                if (!active()) return;
                const completedTexts = results.flatMap((item) => (item?.status === NODE_STATUS_SUCCESS ? [item] : []));
                const failedTexts = results.filter((item) => item?.status === NODE_STATUS_ERROR);
                const firstText = completedTexts[0];
                if (completedTexts.length <= 1) updateExpandedBatchNodeIds((current) => new Set([...current].filter((id) => id !== rootId)));
                if (failedTexts.length) message.error(firstText ? t("canvas.projectPage.partialTextFailed") : failedTexts[0]?.errorDetails || t("canvas.projectPage.generationFailed"));
                updateNodes((prev) =>
                    prev.map((node) => {
                        if (node.id === rootId) {
                            const primaryText = completedTexts.find((text) => text.id === node.metadata?.primaryTextId) || firstText;
                            return {
                                ...node,
                                metadata: {
                                    ...node.metadata,
                                    content: primaryText?.content || "",
                                    texts: completedTexts,
                                    primaryTextId: primaryText?.id,
                                    status: primaryText ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR,
                                    errorDetails: primaryText ? undefined : t("canvas.projectPage.generationFailed"),
                                },
                            };
                        }
                        return node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, status: firstText ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: firstText ? undefined : t("canvas.projectPage.generationFailed") } } : node;
                    }),
                );
                return rootId;
            } catch (error) {
                if (!active() || isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
                recordDiagnostic("画布任务", error, { projectId });
                message.error(errorDetails);
                updateNodes((prev) =>
                    prev.map((node) =>
                        node.id === nodeId || pendingChildIds.includes(node.id)
                            ? node.id === nodeId && !markSourceStatus
                                ? node
                                : {
                                      ...node,
                                      metadata: {
                                          ...node.metadata,
                                          status: NODE_STATUS_ERROR,
                                          errorDetails,
                                          ...(isVideoTaskFailed(error) && node.type === CanvasNodeType.Video ? { videoTaskId: undefined } : {}),
                                      },
                                  }
                            : node,
                    ),
                );
                // Agent must receive the actual failure, not read an unchanged old source as success.
                if (signal) throw error;
            } finally {
                endRun();
                updateRunningNodeId((current) => current === nodeId ? null : current);
            }
        },
        [completeVideoNodeTask, effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest, t],
    );
    useEffect(() => {
        generateNodeRef.current = handleGenerateNode;
    }, [handleGenerateNode]);

    const handleRetryNode = useCallback(
        async (node: CanvasNodeData, imageId?: string) => {
            if (hasResumableVideoTask(node)) {
                await pollVideoNodeTask(node);
                return;
            }
            const sourceNode = findRetrySourceNode(node.id, nodesRef.current, connectionsRef.current) || node;
            const savedImageMetadata = node.type === CanvasNodeType.Image ? node.metadata : undefined;
            const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
            const generationConfig =
                hasSavedImageMetadata && savedImageMetadata
                    ? {
                          ...effectiveConfig,
                          model: savedImageMetadata.model || effectiveConfig.imageModel || effectiveConfig.model,
                          quality: savedImageMetadata.quality || effectiveConfig.quality,
                          size: savedImageMetadata.size || effectiveConfig.size,
                          background: savedImageMetadata.background ?? effectiveConfig.background,
                          count: "1",
                      }
                    : { ...buildGenerationConfig(effectiveConfig, sourceNode, node.type === CanvasNodeType.Text ? "text" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const project = generationProjectRef.current;
            const controller = startGenerationRequest(node.id, sourceNode.id, node.id);
            const active = () => project.alive && generationProjectRef.current === project && !controller.signal.aborted && generationOwnersRef.current.get(node.id)?.controller === controller && nodesRef.current.some((item) => item.id === node.id);
            const updateNodes = guardGenerationSetter(setNodes, active);
            const updateRunningNodeId = guardGenerationSetter(setRunningNodeId, active);
            try {
                const context = hasSavedImageMetadata ? null : await hydrateNodeGenerationContext(buildNodeGenerationContext(sourceNode.id, nodesRef.current, connectionsRef.current, sourceNode.metadata?.prompt || node.metadata?.prompt || ""));
                if (!active()) return;
                const prompt = (savedImageMetadata?.prompt || context?.prompt || "").trim();
                if (!prompt) {
                    message.warning(t("canvas.projectPage.retryPromptMissing"));
                    return;
                }
                const generationType = savedImageMetadata?.generationType;
                const useReferenceImages = generationType ? generationType === "edit" : Boolean(context?.referenceImages.length);
                const retryReferenceImages =
                    hasSavedImageMetadata && savedImageMetadata ? await resolveMetadataReferences(savedImageMetadata) : useReferenceImages ? (context?.referenceImages.length ? context.referenceImages : sourceNodeReferenceImages(sourceNode)) : [];
                if (!active()) return;
                if (useReferenceImages && !retryReferenceImages) {
                    message.error(t("canvas.projectPage.referenceMissing"));
                    updateNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: item.metadata?.content ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: item.metadata?.content ? undefined : t("canvas.projectPage.referenceMissing"), images: item.metadata?.images?.map((image) => (image.id === imageId ? { ...image, status: NODE_STATUS_ERROR, errorDetails: t("canvas.projectPage.referenceMissing") } : image)) } } : item)));
                    return;
                }
                const retryImages = retryReferenceImages || [];
                const retryCropContext = savedImageMetadata?.cropContext || imageOutputCropContext(retryImages, nodesRef.current, connectionsRef.current);

                updateRunningNodeId(node.id);
                updateNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined, images: item.metadata?.images?.map((image) => (image.id === imageId ? { ...image, status: NODE_STATUS_LOADING, errorDetails: undefined } : image)) } } : item)));

                if (node.type === CanvasNodeType.Text) {
                    if (!context) return;
                    let streamed = "";
                    const answer = await requestImageQuestion(
                        generationConfig,
                        buildNodeResponseMessages({ ...context, prompt }),
                        (text) => {
                            streamed = text;
                            updateNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: text, status: NODE_STATUS_LOADING } } : item)));
                        },
                        { signal: controller.signal },
                    );
                    updateNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: answer || streamed, prompt, status: NODE_STATUS_SUCCESS } } : item)));
                    return;
                }
                if (node.type === CanvasNodeType.Video) {
                    await completeVideoNodeTask(node.id, generationConfig, prompt, retryImages, controller.signal, {
                        size: generationConfig.size,
                        seconds: generationConfig.videoSeconds,
                        vquality: generationConfig.vquality,
                        generateAudio: generationConfig.videoGenerateAudio,
                        watermark: generationConfig.videoWatermark,
                        videoMode: generationConfig.videoMode,
                    }, context?.referenceVideos || [], context?.referenceAudios || []);
                    return;
                }
                if (node.type === CanvasNodeType.Audio) {
                    const result = await requestAudioGeneration(generationConfig, prompt, { signal: controller.signal });
                    if (!active()) return;
                    const audio = await storeGeneratedAudio(result, generationConfig.audioFormat);
                    if (!active()) return;
                    updateNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...audioMetadata(audio), prompt, ...buildAudioGenerationMetadata(generationConfig) } } : item)));
                    return;
                }

                const image = useReferenceImages
                    ? await requestEdit(generationConfig, prompt, retryImages, { signal: controller.signal, imageCompression: savedImageMetadata || sourceNode.metadata }).then((items) => items[0])
                    : await requestGeneration(generationConfig, prompt, { signal: controller.signal }).then((items) => items[0]);
                if (!active()) return;
                const uploadedImage = await uploadImage(image.dataUrl, { signal: controller.signal });
                if (!active()) return;
                const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                const retryImage: CanvasNodeImage = {
                    id: imageId || node.metadata?.primaryImageId || nanoid(),
                    status: NODE_STATUS_SUCCESS,
                    content: uploadedImage.url,
                    storageKey: uploadedImage.storageKey,
                    naturalWidth: uploadedImage.width,
                    naturalHeight: uploadedImage.height,
                    bytes: uploadedImage.bytes,
                    mimeType: uploadedImage.mimeType,
                };
                const generationMetadata = savedImageMetadata?.generationType
                    ? {
                          generationType: savedImageMetadata.generationType,
                          model: generationConfig.model,
                          size: generationConfig.size,
                          quality: generationConfig.quality,
                          ...(generationConfig.background ? { background: generationConfig.background } : {}),
                          count: savedImageMetadata.count || 1,
                          references: savedImageMetadata.references,
                      }
                    : buildImageGenerationMetadata(useReferenceImages ? "edit" : "generation", generationConfig, 1, retryImages);
                updateNodes((prev) =>
                    prev.map((item) => {
                        if (item.id !== node.id) return item;
                        const makePrimary = !imageId || !item.metadata?.content;
                        const imageSize = generatedImageNodeSize(uploadedImage.width, uploadedImage.height, item);
                        return {
                            ...item,
                            type: CanvasNodeType.Image,
                            ...(makePrimary ? imageSize : {}),
                            metadata: {
                                ...item.metadata,
                                ...(makePrimary ? imageMetadata(uploadedImage) : { status: NODE_STATUS_SUCCESS }),
                                images: item.metadata?.images?.map((current) => (current.id === retryImage.id ? retryImage : current)),
                                primaryImageId: makePrimary ? retryImage.id : item.metadata?.primaryImageId,
                                cropContext: retryCropContext,
                                prompt,
                                ...generationMetadata,
                            },
                        };
                    }),
                );
            } catch (error) {
                if (!active() || isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
                recordDiagnostic("画布任务", error, { projectId });
                message.error(errorDetails);
                updateNodes((prev) =>
                    prev.map((item) =>
                        item.id === node.id
                            ? {
                                  ...item,
                                  metadata: {
                                      ...item.metadata,
                                      status: item.metadata?.content ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR,
                                      errorDetails: item.metadata?.content ? undefined : errorDetails,
                                      images: item.metadata?.images?.map((image) => (image.id === imageId ? { ...image, status: NODE_STATUS_ERROR, errorDetails } : image)),
                                      ...(isVideoTaskFailed(error) && item.type === CanvasNodeType.Video ? { videoTaskId: undefined } : {}),
                                  },
                              }
                            : item,
                    ),
                );
            } finally {
                finishGenerationRequest(node.id, controller);
                updateRunningNodeId((current) => current === node.id ? null : current);
            }
        },
        [completeVideoNodeTask, effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, pollVideoNodeTask, startGenerationRequest, t],
    );

    const deleteBatchImage = useCallback((nodeId: string, imageId: string) => {
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if ((node?.metadata?.images?.length || 0) <= 2) setExpandedBatchNodeIds((current) => new Set([...current].filter((id) => id !== nodeId)));
        setNodes((prev) =>
            prev.map((item) => {
                if (item.id !== nodeId) return item;
                const images = item.metadata?.images?.filter((image) => image.id !== imageId) || [];
                return { ...item, metadata: { ...item.metadata, images, count: images.length, primaryImageId: item.metadata?.primaryImageId === imageId ? images[0]?.id : item.metadata?.primaryImageId } };
            }),
        );
    }, []);

    const retryBatchImage = useCallback((node: CanvasNodeData, imageId: string) => void handleRetryNode(node, imageId), [handleRetryNode]);

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning(t("canvas.projectPage.emptyTextImage"));
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const nodeSize = getNodeSpec(CanvasNodeType.Config);
            const configNode = createCanvasNode(
                CanvasNodeType.Config,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                {
                    prompt: "",
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                },
            );
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: configNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(configNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message, t],
    );

    const insertAssistantImage = useCallback(
        async (image: CanvasAssistantImage) => {
            const targetProject = generationProjectRef.current;
            const storedImage = image.storageKey ? { url: image.dataUrl, storageKey: image.storageKey, width: 1, height: 1, bytes: 0, mimeType: "image/png" } : await uploadImage(image.dataUrl);
            await ensureImagePreview(storedImage.storageKey);
            const meta = storedImage.width === 1 && storedImage.height === 1 ? await readImageMeta(storedImage.url) : storedImage;
            if (!targetProject.alive || generationProjectRef.current !== targetProject) throw new Error("画布已切换，请在当前画布重新插入");
            const config = fitNodeSize(meta.width, meta.height);
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const node: CanvasNodeData = {
                id,
                type: CanvasNodeType.Image,
                title: image.prompt.slice(0, 32) || "Generated Image",
                position: { x: center.x - config.width / 2, y: center.y - config.height / 2 },
                width: config.width,
                height: config.height,
                metadata: { ...imageMetadata({ ...storedImage, width: meta.width, height: meta.height }), prompt: image.prompt },
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [screenToCanvas, size.height, size.width],
    );

    const insertAssistantText = useCallback(
        (text: string, title?: string) => {
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const node = {
                ...createCanvasNode(CanvasNodeType.Text, center, { content: text, status: NODE_STATUS_SUCCESS }),
                title: title || text.slice(0, 32) || "Assistant Text",
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
        },
        [screenToCanvas, size.height, size.width],
    );

    const handleAssetInsert = useCallback(
        async (payload: InsertAssetPayload) => {
            if (payload.kind === "text") {
                insertAssistantText(payload.content, payload.title);
            } else if (payload.kind === "video") {
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const nextSize = fitNodeSize(payload.width || spec.width, payload.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                setNodes((prev) => [
                    ...prev,
                    {
                        id,
                        type: CanvasNodeType.Video,
                        title: payload.title,
                        position: { x: center.x - nextSize.width / 2, y: center.y - nextSize.height / 2 },
                        width: nextSize.width,
                        height: nextSize.height,
                        metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: payload.width, naturalHeight: payload.height },
                    },
                ]);
                setSelectedNodeIds(new Set([id]));
            } else {
                await insertAssistantImage({ id: `asset-${Date.now()}`, prompt: payload.title, dataUrl: payload.dataUrl, storageKey: payload.storageKey });
            }
            setAssetPickerOpen(false);
        },
        [insertAssistantImage, insertAssistantText, screenToCanvas, size.height, size.width],
    );

    const handleWorkflowInsert = useCallback(async (workflow: SavedWorkflow) => {
        const targetProject = generationProjectRef.current;
        const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
        const addition = await cloneWorkflow(workflow, center);
        if (!targetProject.alive || generationProjectRef.current !== targetProject) throw new Error("画布已切换，请在当前画布重新插入");
        const nextNodes = [...nodesRef.current, ...addition.nodes], nextConnections = [...connectionsRef.current, ...addition.connections];
        nodesRef.current = nextNodes;
        connectionsRef.current = nextConnections;
        setNodes(nextNodes);
        setConnections(nextConnections);
        setSelectedNodeIds(new Set(addition.nodes.map((node) => node.id)));
        setSelectedConnectionId(null);
    }, [screenToCanvas, size.width, size.height]);
    // Memoize every callback and render function passed to CanvasNode.
    // CanvasNode uses React.memo, but new prop references would invalidate it on every render and rerender every node
    // during click, hover, or viewport changes, which is especially expensive for Markdown. These useCallback values
    // and their memoized map/handler dependencies remain stable during interaction, so unchanged nodes do not rerender.
    const handleConnectionSelect = useCallback((connectionId: string) => {
        setSelectedConnectionId(connectionId);
        setSelectedNodeIds(new Set());
        setContextMenu(null);
    }, []);
    const handleConnectionContextMenu = useCallback((event: ReactMouseEvent<SVGPathElement>, connectionId: string) => {
        setSelectedConnectionId(connectionId);
        setSelectedNodeIds(new Set());
        setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId });
    }, []);
    const handleNodeViewImage = useCallback((node: CanvasNodeData, imageId?: string) => {
        setPreviewNodeId(node.id);
        setPreviewImageId(imageId || null);
    }, []);
    const handleNodeRetry = useCallback(
        (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Text && (node.metadata?.textCount || 1) > 1) {
                void generateNodeRef.current?.(node.id, "text", node.metadata?.prompt || "");
                return;
            }
            void handleRetryNode(node);
        },
        [handleRetryNode],
    );
    const handleNodeContextMenu = useCallback((event: ReactMouseEvent, nodeId: string) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedNodeIds((current) => (current.has(nodeId) ? current : new Set([nodeId])));
        setSelectedConnectionId(null);
        setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId });
    }, []);

    const renderNodePanel = useCallback(
        (panelNode: CanvasNodeData) =>
            getNodeDefinition(panelNode.type)?.Panel ? (
                renderPluginPanel(panelNode)
            ) : panelNode.type === CanvasNodeType.Config ? (
                <CanvasConfigComposer
                    nodeId={panelNode.id}
                    nodes={contentNodes}
                    value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                    inputs={configInputsById.get(panelNode.id) || []}
                    connectedNodes={connectedNodesByNodeId.get(panelNode.id) || []}
                    onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                    onClose={() => setDialogNodeId(null)}
                    onAddImageReference={addImageReference}
                    onDisconnectReference={disconnectNodeReference}
                    onStartReferenceSelection={startNodeReferenceSelection}
                />
            ) : (
                <CanvasNodePromptPanel
                    node={panelNode}
                    nodes={contentNodes}
                    isRunning={runningNodeId === panelNode.id || generationRequestsRef.current.has(panelNode.id)}
                    mentionReferences={mentionReferencesByNodeId.get(panelNode.id) || EMPTY_REFERENCES}
                    connectedNodes={connectedNodesByNodeId.get(panelNode.id) || []}
                    onPromptChange={handleNodePromptChange}
                    onConfigChange={handleConfigNodeChange}
                    onGenerate={handleGenerateNode}
                    onStop={confirmStopGeneration}
                    onDisconnectReference={disconnectNodeReference}
                    onStartReferenceSelection={startNodeReferenceSelection}
                    modeOverride={getNodeDefinition(panelNode.type)?.useBuiltinPanel?.mode}
                    onImageSettingsOpenChange={(open) => {
                        setNodeImageSettingsOpen(open);
                        if (open) setToolbarNodeId(null);
                    }}
                />
            ),
        [addImageReference, configInputsById, confirmStopGeneration, connectedNodesByNodeId, disconnectNodeReference, handleConfigNodeChange, handleGenerateNode, handleNodePromptChange, mentionReferencesByNodeId, contentNodes, renderPluginPanel, runningNodeId, startNodeReferenceSelection],
    );

    const renderNodeContentPanel = useCallback(
        (contentNode: CanvasNodeData) => (
            <CanvasConfigNodePanel
                node={contentNode}
                isRunning={runningNodeId === contentNode.id || generationRequestsRef.current.has(contentNode.id)}
                nodes={contentNodes}
                inputs={configInputsById.get(contentNode.id) || []}
                onAddImageReference={addImageReference}
                connectedNodes={connectedNodesByNodeId.get(contentNode.id) || []}
                onDisconnectReference={disconnectNodeReference}
                onStartReferenceSelection={startNodeReferenceSelection}
                onConfigChange={handleConfigNodeChange}
                onStop={confirmStopGeneration}
                onGenerate={(nodeId) => {
                    const target = nodesRef.current.find((item) => item.id === nodeId);
                    void handleGenerateNode(nodeId, "image", target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                }}
            />
        ),
        [addImageReference, configInputsById, confirmStopGeneration, connectedNodesByNodeId, disconnectNodeReference, handleConfigNodeChange, handleGenerateNode, contentNodes, runningNodeId, startNodeReferenceSelection],
    );

    if (hydrationError) return <main className="flex h-full items-center justify-center bg-background p-6 text-foreground" role="alert">{hydrationError}</main>;
    if (!projectLoaded) return <CanvasRefreshShell />;

    return (
        <main className="flex h-full min-h-0 overflow-clip" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <section className="relative min-w-0 flex-1 overflow-clip">
                <CanvasSidePanel nodes={contentNodes} selectedNodeIds={selectedNodeIds} connections={connections} onInsertAsset={handleAssetInsert} onInsertWorkflow={handleWorkflowInsert} />
                <CanvasTopBar
                    title={currentProject?.title || t("canvas.projectPage.untitledCanvas")}
                    titleDraft={titleDraft}
                    isTitleEditing={titleEditing}
                    onTitleDraftChange={setTitleDraft}
                    onStartTitleEditing={startTitleEditing}
                    onFinishTitleEditing={finishTitleEditing}
                    onCancelTitleEditing={() => setTitleEditing(false)}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    onHome={() => navigate("/")}
                    onProjects={() => navigate("/canvas")}
                    onCreateProject={createAndOpenProject}
                    onDeleteProject={deleteCurrentProject}
                    onExportProject={exportCurrentProject}
                    onImportImage={() => handleUploadRequest()}
                    onOpenPlugins={() => setPluginManagerOpen(true)}
                    onOpenCleanup={() => setCleanupOpen(true)}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                />

                <InfiniteCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    tool={canvasTool}
                    backgroundMode={backgroundMode}
                    onConnectionCutStart={(event) => {
                        if (referencePickerNodeId || connectingParams) return false;
                        if (focusAnimRef.current) cancelAnimationFrame(focusAnimRef.current);
                        focusAnimRef.current = null;
                        return connectionCutter.start(event);
                    }}
                    isCuttingConnections={connectionCutter.cutting}
                    onViewportChange={(next) => {
                        if (focusAnimRef.current) cancelAnimationFrame(focusAnimRef.current);
                        focusAnimRef.current = null;
                        viewportRef.current = next;
                        setViewport(next);
                        setContextMenu(null);
                    }}
                    onCanvasMouseDown={(event) => {
                        if (!referencePickerNodeId) handleCanvasMouseDown(event);
                    }}
                    onCanvasDeselect={referencePickerNodeId ? undefined : deselectCanvas}
                    onCanvasContextMenu={(event) => {
                        if (referencePickerNodeId) return;
                        setContextMenu(null);
                        setNodeCreatePosition(screenToCanvas(event.clientX, event.clientY));
                    }}
                    onDrop={handleDrop}
                >
                    <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 0 }}>
                        {visibleConnections.filter(({ connection }) => !connectionCutter.pendingIds.has(connection.id)).map(({ connection, from, to }) => (
                            <ConnectionPath
                                key={connection.id}
                                connection={connection}
                                from={from}
                                to={to}
                                active={selectedConnectionId === connection.id}
                                onSelect={handleConnectionSelect}
                                onContextMenu={handleConnectionContextMenu}
                            />
                        ))}
                        {connectingParams ? connectionDragNodeIds(connectingParams).map((nodeId) => <ActiveConnectionPath key={nodeId} node={nodeById.get(nodeId)} handle={connectingParams} mouseWorld={mouseWorld} target={connectionTargetNodeId ? nodeById.get(connectionTargetNodeId) : undefined} />) : null}
                        <ConnectionCutEffects trail={connectionCutter.trail} severed={connectionCutter.severed} scale={viewport.k} />
                    </svg>

                    {visibleNodes.map((node) => (
                        <CanvasNode
                            key={node.id}
                            data={node}
                            isDragging={isNodeDragging && dragRef.current.movedIds.has(node.id)}
                            scale={viewport.k}
                            isSelected={selectedNodeIds.has(node.id)}
                            isConnectionTarget={connectionTargetNodeId === node.id}
                            isConnecting={Boolean(connectingParams)}
                            referenceSelectionState={!referencePickerNodeId ? undefined : node.id === referencePickerNodeId ? "target" : referenceConnectedNodeIds.has(node.id) || !isCanvasReferenceNode(node, nodes) ? "disabled" : "available"}
                            showPanel={!isNodeResizing && dialogNodeId === node.id && !selectionBox && !getNodeDefinition(node.type)?.hidePanel}
                            groupChildCount={groupChildCountById.get(node.id) || 0}
                            isGroupDropTarget={dropTargetGroupId === node.id}
                            batchExpanded={expandedBatchNodeIds.has(node.id)}
                            showImageInfo={showImageInfo}
                            mentionReferences={mentionReferencesByNodeId.get(node.id) || EMPTY_REFERENCES}
                            pluginHost={pluginHost}
                            registryVersion={nodeRegistryVersion}
                            renderPanel={renderNodePanel}
                            renderNodeContent={renderNodeContentPanel}
                            onMouseDown={handleNodeMouseDown}
                            onSelectCapture={handleNodeSelectCapture}
                            onConnectStart={handleConnectStart}
                            onResizeStart={handleNodeResizeStart}
                            onResize={handleNodeResize}
                            onResizeEnd={handleNodeResizeEnd}
                            onContentChange={handleNodeContentChange}
                            onTitleChange={handleNodeTitleChange}
                            onToggleBatch={toggleBatchExpanded}
                            onSetBatchPrimary={setBatchPrimary}
                            onDuplicateBatchImage={duplicateBatchImage}
                            onDownloadBatchImage={downloadBatchImage}
                            onRetryBatchImage={retryBatchImage}
                            onDeleteBatchImage={deleteBatchImage}
                            onRetry={handleNodeRetry}
                            onViewImage={handleNodeViewImage}
                            onSelectReference={selectNodeReference}
                            onContextMenu={handleNodeContextMenu}
                        />
                    ))}

                    {selectionBox ? (
                        <svg
                            className="pointer-events-none absolute z-[100] overflow-visible"
                            style={{
                                left: Math.min(selectionBox.startWorldX, selectionBox.currentWorldX),
                                top: Math.min(selectionBox.startWorldY, selectionBox.currentWorldY),
                                width: Math.abs(selectionBox.currentWorldX - selectionBox.startWorldX),
                                height: Math.abs(selectionBox.currentWorldY - selectionBox.startWorldY),
                            }}
                        >
                            <rect width="100%" height="100%" fill={theme.canvas.selectionFill} stroke={theme.canvas.selectionStroke} strokeOpacity={0.55} strokeWidth={1 / viewport.k} strokeDasharray={`${6 / viewport.k} ${4 / viewport.k}`} />
                        </svg>
                    ) : null}
                    {pendingConnectionCreate ? <ConnectionCreateMenu pending={pendingConnectionCreate} scale={viewport.k} onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)} onClose={cancelPendingConnectionCreate} /> : null}
                    {nodeCreatePosition ? (
                        <NodeCreateMenu
                            position={nodeCreatePosition}
                            scale={viewport.k}
                            onCreate={(type) => {
                                createNode(type, nodeCreatePosition);
                                setNodeCreatePosition(null);
                            }}
                            onClose={() => setNodeCreatePosition(null)}
                        />
                    ) : null}
                </InfiniteCanvas>

                {referencePickerNodeId ? <button type="button" className="absolute left-1/2 top-4 z-[90] -translate-x-1/2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }} onClick={exitNodeReferenceSelection}>{t("canvas.references.selectingHint")}</button> : null}

                {selectedNodes.length === 1 && selectedNodes[0].type === CanvasNodeType.Group && !isNodeDragging && !isNodeResizing && !referencePickerNodeId && !selectionBox ? <CanvasGroupColorToolbar key={selectedNodes[0].id} node={selectedNodes[0]} viewport={viewport} onColorChange={(groupColor) => pluginHostRef.current?.updateMetadata(selectedNodes[0].id, { groupColor })} /> : null}

                <CanvasNodeHoverToolbar
                    node={isNodeDragging || isNodeResizing || nodeImageSettingsOpen || Boolean(referencePickerNodeId) || expandedBatchNodeIds.has(toolbarNode?.id || "") ? null : toolbarNode}
                    viewport={viewport}
                    extraTools={toolbarNode ? buildNodeToolbarItems(toolbarNode) : undefined}
                    onKeep={keepNodeToolbar}
                    onLeave={hideNodeToolbar}
                    onAddToAgent={(node) => useCanvasAssistantStore.getState().addReferences([node.id])}
                    onInfo={(node) => setInfoNodeId(node.id)}
                    onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 20) - 2))}
                    onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 20) + 2))}
                    onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                    onGenerateImage={generateImageFromTextNode}
                    onUpload={(node) => handleUploadRequest(node.id)}
                    onDownload={downloadNodeImage}
                    onBatchDownload={(node) => void downloadImages([node.id], nodesRef.current, node.title || "分组图片")}
                    batchDownloading={batchDownloading}
                    onSaveAsset={(node) => void saveNodeAsset(node)}
                    onPaint={(node) => setPaintNodeId(node.id)}
                    onMaskEdit={(node) => setMaskEditNodeId(node.id)}
                    onCrop={(node) => setCropNodeId(node.id)}
                    onExtractSelection={(node) => setExtractNodeId(node.id)}
                    onSplit={(node) => setSplitNodeId(node.id)}
                    onUpscale={(node) => setUpscaleNodeId(node.id)}
                    onSuperResolve={(node) => setSuperResolveNodeId(node.id)}
                    onAngle={(node) => setAngleNodeId(node.id)}
                    onViewImage={handleNodeViewImage}
                    onReversePrompt={createImageReversePromptNodes}
                    onRetry={(node) => void handleRetryNode(node)}
                    onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                    onDelete={(node) => deleteNodes(new Set([node.id]))}
                    onUngroup={(node) => ungroupSelection(new Set([node.id]))}
                />

                {hasMultipleSelectedNodes && !selectionBox ? (
                    <CanvasSelectionToolbar
                        onAddToAgent={() => useCanvasAssistantStore.getState().addReferences([...selectedNodeIdsRef.current])}
                        nodes={selectedNodes}
                        viewport={viewport}
                        showToolbar={!isNodeDragging && !isNodeResizing}
                        canGroup={canGroupSelection}
                        canUngroup={canUngroupSelection}
                        onGroup={groupSelection}
                        onUngroup={ungroupSelection}
                        onArrange={(mode) => setNodes((current) => arrangeSelection(current, selectedNodeIdsRef.current, mode, connectionsRef.current))}
                        onSaveAssets={() => void (async () => {
                            const images = collectDownloadImages(selectedNodeIdsRef.current, nodesRef.current);
                            if (!images.length) { message.warning("所选节点中没有可保存的图片"); return; }
                            let saved = 0, skipped = 0, failed = 0;
                            for (const item of images) {
                                if (useAssetStore.getState().assets.some(asset => asset.kind === "image" && (item.storageKey ? asset.data.storageKey === item.storageKey : asset.data.dataUrl === item.content))) { skipped++; continue; }
                                try {
                                    const blob = item.storageKey ? await getImageBlob(item.storageKey) : null;
                                    if (item.storageKey && !blob) throw new Error("图片原文件不存在");
                                    const node = nodesRef.current.find(node => node.id === item.nodeId);
                                    const source = item.index ? node?.metadata?.images?.[item.index - 1] : node?.metadata;
                                    const image = blob ? { url: await resolveImageUrl(item.storageKey), storageKey: item.storageKey, width: source?.naturalWidth || node?.width || 0, height: source?.naturalHeight || node?.height || 0, bytes: blob.size, mimeType: blob.type || item.mimeType || "image/png" } : await uploadImage(item.content);
                                    addAsset({ kind: "image", title: item.index ? `${item.title} ${item.index}` : item.title, coverUrl: image.url, tags: [], source: "Canvas", data: { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType }, metadata: { source: "canvas", nodeId: item.nodeId, prompt: node?.metadata?.prompt } });
                                    saved++;
                                } catch { failed++; }
                            }
                            if (failed) message.warning(`已存入 ${saved} 张，${skipped} 张已收藏，${failed} 张保存失败`);
                            else message.success(`已存入图片库 ${saved} 张${skipped ? `，${skipped} 张已收藏` : ""}`);
                        })()}
                        onSaveToResources={() => {
                            const ids = expandDragNodeIds(selectedNodeIdsRef.current, nodesRef.current);
                            const savedNodes = nodesRef.current.filter(node => ids.has(node.id));
                            const savedConnections = connectionsRef.current.filter(edge => ids.has(edge.fromNodeId) && ids.has(edge.toNodeId));
                            useAssetStore.getState().addAsset({ kind: "text", title: "画布工作流", coverUrl: "", tags: [], source: "画布", data: { content: `${savedNodes.length} 个节点 · ${savedConnections.length} 条连线` }, metadata: { resourceType: "workflow", workflow: { nodes: savedNodes, connections: savedConnections } } });
                            message.success("已保存到资源管理器");
                        }}
                        onDownload={() => void downloadImages(selectedNodeIdsRef.current, nodesRef.current)}
                        downloading={batchDownloading}
                    />
                ) : null}

                <CanvasToolbar
                    selectedCount={selectedNodeIds.size}
                    canvasTool={canvasTool}
                    onFocusSelected={focusSelectedNode}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    backgroundMode={backgroundMode}
                    showImageInfo={showImageInfo}
                    onAddImage={() => createNode(CanvasNodeType.Image)}
                    onAddVideo={() => createNode(CanvasNodeType.Video)}
                    onAddAudio={() => createNode(CanvasNodeType.Audio)}
                    onAddText={() => createNode(CanvasNodeType.Text)}
                    onAddConfig={() => createNode(CanvasNodeType.Config)}
                    onAddGroup={() => createNode(CanvasNodeType.Group)}
                    onAddExtensionNode={(type) => createNode(type)}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    onUpload={() => handleUploadRequest()}
                    onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                    onClear={() => setClearConfirmOpen(true)}
                    onCanvasToolChange={setCanvasTool}
                    onBackgroundModeChange={setBackgroundMode}
                    onShowImageInfoChange={setShowImageInfo}
                />

                {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={setViewport} /> : null}

                <CanvasZoomControls scale={viewport.k} onScaleChange={setZoomScale} onReset={resetViewport} isMiniMapOpen={isMiniMapOpen} onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)} />

                {contextMenu ? (
                    <CanvasNodeContextMenu
                        onAddToAgent={() => { if (contextMenu.type === "node") useCanvasAssistantStore.getState().addReferences(selectedNodeIdsRef.current.has(contextMenu.nodeId) ? [...selectedNodeIdsRef.current] : [contextMenu.nodeId]); setContextMenu(null); }}
                        menu={contextMenu}
                        canCaptureVideoFrame={contextMenuNode?.type === CanvasNodeType.Video && Boolean(contextMenuNode.metadata?.content)}
                        canGroup={contextMenu.type === "node" && canGroupSelection}
                        canUngroup={contextMenu.type === "node" && canUngroupSelection}
                        onClose={() => setContextMenu(null)}
                        onCaptureVideoFrame={(position) => {
                            if (contextMenu.type !== "node") return;
                            void captureVideoNodeFrame(contextMenu.nodeId, position);
                        }}
                        onDuplicate={() => {
                            if (contextMenu.type !== "node") return;
                            duplicateNode(contextMenu.nodeId);
                            setContextMenu(null);
                        }}
                        onGroup={groupSelection}
                        onUngroup={ungroupSelection}
                        onDelete={() => {
                            if (contextMenu.type === "node") {
                                deleteNodes(new Set([contextMenu.nodeId]));
                            } else {
                                deleteConnection(contextMenu.connectionId);
                            }
                            setContextMenu(null);
                        }}
                    />
                ) : null}

                <input ref={imageInputRef} type="file" multiple accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" className="hidden" onChange={handleImageInputChange} />

                <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} />
                <CanvasPluginManagerModal open={pluginManagerOpen} onClose={() => setPluginManagerOpen(false)} />
                <CanvasCleanupModal open={cleanupOpen} projectId={projectId} onClose={() => setCleanupOpen(false)} beforeOperation={() => {
                    const busy = nodesRef.current.some((n) => n.metadata?.status === "loading") || runningTableBatches.size > 0 || isLocalFusionRunning();
                    const agent = useCanvasAssistantStore.getState();
                    if (busy || generationRequestsRef.current.size || agent.sessions.some((session) => session.running || Boolean(session.pending))) throw new Error("请先停止正在运行的生成或 Agent 任务，再清理 / 恢复，避免结果重新写入");
                    updateProject(projectId, { nodes: nodesRef.current, connections: connectionsRef.current, chatSessions, activeChatId, backgroundMode, showImageInfo, viewport: viewportRef.current });
                    historyPausedRef.current = true;
                    if (historyCommitTimerRef.current) { clearTimeout(historyCommitTimerRef.current); historyCommitTimerRef.current = null; }
                    if (viewportSaveTimerRef.current) { clearTimeout(viewportSaveTimerRef.current); viewportSaveTimerRef.current = null; }
                    return () => { historyPausedRef.current = false; };
                }} />


                {extractNode?.metadata?.content ? <CanvasExtractSelectionDialog node={extractNode} open onClose={() => setExtractNodeId(null)} onConfirm={(rect, ratio) => extractSelectionNode(extractNode, rect, ratio)} /> : null}

                {paintNode?.metadata?.content ? <CanvasNodePaintDialog dataUrl={paintNode.metadata.content} open onClose={() => setPaintNodeId(null)} onConfirm={(dataUrl) => paintImageNode(paintNode, dataUrl)} /> : null}

                {cropNode?.metadata?.content ? <CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open={Boolean(cropNode)} onClose={() => setCropNodeId(null)} onConfirm={(crop) => cropImageNode(cropNode!, crop).catch((error) => { message.error(error instanceof Error ? error.message : "裁剪扩图失败"); })} /> : null}

                {maskEditNode?.metadata?.content ? (
                    <CanvasNodeMaskEditDialog dataUrl={maskEditNode.metadata.content} open={Boolean(maskEditNode)} onClose={() => setMaskEditNodeId(null)} onConfirm={(payload) => void maskEditImageNode(maskEditNode!, payload)} />
                ) : null}

                {splitNode?.metadata?.content ? <CanvasNodeSplitDialog dataUrl={splitNode.metadata.content} open={Boolean(splitNode)} onClose={() => setSplitNodeId(null)} onConfirm={(params) => splitImageNode(splitNode!, params).catch((error) => { message.error(error instanceof Error ? error.message : "多宫格裁剪失败"); })} /> : null}

                {upscaleNode?.metadata?.content ? (
                    <CanvasNodeUpscaleDialog dataUrl={upscaleNode.metadata.content} open={Boolean(upscaleNode)} onClose={() => setUpscaleNodeId(null)} onConfirm={(params) => void upscaleImageNode(upscaleNode!, params)} />
                ) : null}

                <Modal title={t("canvas.projectPage.superResolve")} open={Boolean(superResolveNode?.metadata?.content)} centered footer={null} onCancel={() => setSuperResolveNodeId(null)}>
                    <div className="py-8 text-center text-base font-medium">{t("canvas.projectPage.notImplemented")}</div>
                </Modal>

                {angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open={Boolean(angleNode)} onClose={() => setAngleNodeId(null)} onConfirm={(params) => void generateAngleNode(angleNode!, params)} /> : null}

                <CanvasImagePreviewDialog dataUrl={previewContent || ""} title={previewNode?.title || t("assets.kinds.image")} open={Boolean(previewContent)} onClose={() => { setPreviewNodeId(null); setPreviewImageId(null); }} onPrevious={() => navigatePreview(-1)} onNext={() => navigatePreview(1)} position={previewIndex + 1} total={previewImages.length} images={previewImages} onSelect={(index) => { const image = previewImages[index]; if (image) { setPreviewNodeId(image.nodeId); setPreviewImageId(image.imageId || null); } }} />

                <Modal
                    title={t("canvas.projectPage.clearTitle")}
                    open={clearConfirmOpen}
                    centered
                    onCancel={() => setClearConfirmOpen(false)}
                    footer={
                        <>
                            <Button onClick={() => setClearConfirmOpen(false)}>{t("common.cancel")}</Button>
                            <Button danger type="primary" onClick={clearCanvas}>
                                {t("canvas.projectPage.clear")}
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">{t("canvas.projectPage.clearDescription")}</p>
                </Modal>

                <AssetPickerModal open={assetPickerOpen} onInsert={handleAssetInsert} onClose={() => setAssetPickerOpen(false)} />
            </section>
        </main>
    );
}
