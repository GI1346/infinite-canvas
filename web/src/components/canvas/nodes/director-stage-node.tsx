import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    ArrowDownToLine,
    Box,
    Camera,
    Check,
    CircleHelp,
    Clapperboard,
    Download,
    Eye,
    Film,
    History,
    Images,
    MousePointer2,
    Move,
    PanelRightOpen,
    RotateCw,
    Save,
    Scaling,
    X,
} from "lucide-react";
import { nanoid } from "nanoid";

import { stopWorkflowControlDrag } from "@/components/canvas/workflow-node-interactions";
import { canvasGlass } from "@/lib/canvas-theme";
import {
    ALL_PROP_PRESETS,
    applyDirectorAgentPrompt,
    DEFAULT_VIEW_SETTINGS,
    defaultDirectorState,
    defaultTimelineState,
    DIRECTOR_CAMERA_PRESETS,
    DIRECTOR_ENVIRONMENT_PRESETS,
    emptyJoints,
    resolveCharacterPreset,
    type DirectorCameraPreset,
} from "@/lib/canvas/director/presets";
import { toScale3 } from "@/lib/canvas/director/scene-builders";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { imageMetadata, videoMetadata } from "@/lib/canvas/canvas-node-factory";
import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import {
    CanvasNodeType,
    DIRECTOR_NODE_TYPE,
    type DirectorBackgroundItem,
    type DirectorCameraItem,
    type DirectorCharacterItem,
    type DirectorCustomAction,
    type DirectorCustomAsset,
    type DirectorEnvironment,
    type DirectorKeyframe,
    type DirectorPropItem,
    type DirectorRevision,
    type DirectorSceneContent,
    type DirectorSnapshot,
    type DirectorStageState,
    type DirectorTimelineState,
    type DirectorViewSettings,
} from "@/types/canvas";
import type { CanvasNodeContext, CanvasNodeDefinition } from "@/types/canvas-plugin";

import { DirectorAssetDrawer } from "./director/DirectorAssetDrawer";
import { DirectorInspector } from "./director/DirectorInspector";
import {
    DirectorExportVideoModal,
    DirectorMediaDrawer,
    DirectorRevisionsDrawer,
    DirectorShortcutsModal,
    DirectorViewGuideModal,
} from "./director/DirectorOverlays";
import { DirectorTimeline } from "./director/DirectorTimeline";
import {
    DirectorViewport,
    type CameraTargetPickTask,
    type DirectorViewportHandle,
    type PathDrawTask,
    type PlacementTask,
    type SelectedEntity,
    type TransformTool,
} from "./director/DirectorViewport";

const stop = (event: { stopPropagation(): void }) => event.stopPropagation();

function readDirectorState(node: CanvasNodeContext["node"]): DirectorStageState {
    const raw = node.metadata?.directorData;
    const base = defaultDirectorState();
    if (!raw || !Array.isArray(raw.cameras) || !raw.cameras.length) return base;
    return {
        ...base,
        ...raw,
        mode: raw.mode === "dynamic" ? "dynamic" : "static",
        viewSettings: { ...DEFAULT_VIEW_SETTINGS, ...(raw.viewSettings || {}) },
        environment: raw.environment
            ? {
                  ...base.environment!,
                  ...raw.environment,
                  keyLight: { ...base.environment!.keyLight, ...(raw.environment.keyLight || {}) },
                  fillLight: { ...base.environment!.fillLight, ...(raw.environment.fillLight || {}) },
                  rimLight: { ...base.environment!.rimLight, ...(raw.environment.rimLight || {}) },
              }
            : base.environment,
        characters: Array.isArray(raw.characters) ? raw.characters : base.characters,
        props: Array.isArray(raw.props) ? raw.props : [],
        cameras: raw.cameras,
        pipCameraId: raw.pipCameraId || raw.activeCameraId || raw.cameras[0].id,
        timeline: { ...defaultTimelineState(), ...(raw.timeline || {}) },
        backgrounds: Array.isArray(raw.backgrounds) ? raw.backgrounds : [],
        customAssets: Array.isArray(raw.customAssets) ? raw.customAssets : [],
        customActions: Array.isArray(raw.customActions) ? raw.customActions : [],
        revisions: Array.isArray(raw.revisions) ? raw.revisions : [],
        snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [],
    };
}

function extractSceneContent(s: DirectorStageState): DirectorSceneContent {
    return {
        characters: structuredClone(s.characters),
        props: structuredClone(s.props || []),
        cameras: structuredClone(s.cameras),
        activeCameraId: s.activeCameraId,
        environment: structuredClone(s.environment || DIRECTOR_ENVIRONMENT_PRESETS.studio.env),
        backgroundKind: s.backgroundKind || "none",
        backgroundUrl: s.panoramaUrl,
        timeline: structuredClone(s.timeline || defaultTimelineState()),
    };
}

function DirectorStageModal({
    open,
    ctx,
    persisted,
    onPersist,
    onClose,
}: {
    open: boolean;
    ctx: CanvasNodeContext;
    persisted: DirectorStageState;
    onPersist: (next: DirectorStageState) => void;
    onClose: () => void;
}) {
    const { theme, node } = ctx;
    const viewportRef = useRef<DirectorViewportHandle>(null);

    const [draft, setDraft] = useState<DirectorStageState>(persisted);
    const [dirty, setDirty] = useState(false);
    const [tool, setTool] = useState<TransformTool>("translate");
    const [selected, setSelected] = useState<SelectedEntity>(null);
    const [assetOpen, setAssetOpen] = useState(false);
    const [inspectorOpen, setInspectorOpen] = useState(true);
    const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
    const [guideOpen, setGuideOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [revisionsOpen, setRevisionsOpen] = useState(false);
    const [mediaOpen, setMediaOpen] = useState(false);
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [viewfinderOpen, setViewfinderOpen] = useState(false);
    const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
    const [pendingModeSwitch, setPendingModeSwitch] = useState<"static" | "dynamic" | null>(null);
    const [previewRevision, setPreviewRevision] = useState<DirectorRevision | null>(null);

    const [mainViewId, setMainViewId] = useState<"director" | string>("director");
    const [poseEditMode, setPoseEditMode] = useState(false);
    const [activeJointGroup, setActiveJointGroup] = useState("body");
    const [currentTime, setCurrentTime] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [sending, setSending] = useState(false);
    const [agentFeedback, setAgentFeedback] = useState("");

    const [placementTask, setPlacementTask] = useState<PlacementTask | null>(null);
    const [pathTask, setPathTask] = useState<PathDrawTask | null>(null);
    const [cameraPickTask, setCameraPickTask] = useState<CameraTargetPickTask | null>(null);

    // 每次打开弹窗时同步最新持久化状态，自动弹出「导演视角操作」说明，并默认选中场景首个角色以便立刻使用移动/旋转/缩放 Gizmo
    useEffect(() => {
        if (open) {
            setDraft(persisted);
            setDirty(false);
            setPreviewRevision(null);
            setPlaying(false);
            setCurrentTime(0);
            setGuideOpen(true);
            if (persisted.characters[0]) {
                setSelected({ kind: "character", id: persisted.characters[0].id });
            } else if (persisted.props?.[0]) {
                setSelected({ kind: "prop", id: persisted.props[0].id });
            } else if (persisted.cameras[0]) {
                setSelected({ kind: "camera", id: persisted.cameras[0].id });
            } else {
                setSelected(null);
            }
        }
    }, [open]);

    // 切换到移动/旋转/缩放工具时若未选中对象，自动选中首个可编辑对象
    const selectTool = useCallback(
        (nextTool: TransformTool) => {
            setTool(nextTool);
            if (nextTool !== "select" && !selected) {
                if (draft.characters[0]) setSelected({ kind: "character", id: draft.characters[0].id });
                else if (draft.props?.[0]) setSelected({ kind: "prop", id: draft.props[0].id });
                else if (draft.cameras[0]) setSelected({ kind: "camera", id: draft.cameras[0].id });
            }
        },
        [selected, draft.characters, draft.props, draft.cameras],
    );

    const mutate = useCallback((updater: (prev: DirectorStageState) => DirectorStageState) => {
        setDraft((prev) => updater(prev));
        setDirty(true);
    }, []);

    // 若处于修订版本只读预览，则用历史场景覆写展示
    const displayState = useMemo<DirectorStageState>(() => {
        if (!previewRevision) return draft;
        const sc = previewRevision.scene;
        return {
            ...draft,
            characters: sc.characters,
            props: sc.props,
            cameras: sc.cameras,
            activeCameraId: sc.activeCameraId,
            environment: sc.environment,
            backgroundKind: sc.backgroundKind,
            panoramaUrl: sc.backgroundUrl,
            timeline: sc.timeline,
        };
    }, [draft, previewRevision]);

    // 动态预演播放循环
    useEffect(() => {
        if (!open || !playing || displayState.mode !== "dynamic") return;
        const duration = displayState.timeline?.duration || 20;
        const loop = displayState.timeline?.loop !== false;
        let last = performance.now();
        let raf = 0;
        const step = (now: number) => {
            const dt = (now - last) / 1000;
            last = now;
            setCurrentTime((t) => {
                const next = t + dt;
                if (next >= duration) {
                    if (loop) return next % duration;
                    setPlaying(false);
                    return duration;
                }
                return next;
            });
            raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [open, playing, displayState.mode, displayState.timeline?.duration, displayState.timeline?.loop]);

    const saveNow = useCallback(
        (customLabel?: string) => {
            const rev: DirectorRevision = {
                id: nanoid(),
                label: customLabel || `版本 ${(draft.revisions?.length || 0) + 1}`,
                savedAt: Date.now(),
                mode: draft.mode || "static",
                scene: extractSceneContent(draft),
            };
            const next: DirectorStageState = {
                ...draft,
                revisions: [rev, ...(draft.revisions || [])].slice(0, 20),
            };
            setDraft(next);
            setDirty(false);
            onPersist(next);
        },
        [draft, onPersist],
    );

    const requestClose = useCallback(() => {
        if (dirty) {
            setUnsavedDialogOpen(true);
        } else {
            onClose();
        }
    }, [dirty, onClose]);

    // 落到地面（快捷键 G）
    const dropSelectedToGround = useCallback(() => {
        if (!selected || previewRevision) return;
        if (selected.kind === "character") {
            mutate((prev) => ({
                ...prev,
                characters: prev.characters.map((c) =>
                    c.id === selected.id ? { ...c, position: [c.position[0], 0, c.position[2]] } : c,
                ),
            }));
        } else if (selected.kind === "prop") {
            mutate((prev) => ({
                ...prev,
                props: (prev.props || []).map((p) =>
                    p.id === selected.id ? { ...p, position: [p.position[0], 0, p.position[2]] } : p,
                ),
            }));
        }
    }, [selected, previewRevision, mutate]);

    // 键盘快捷键：0/1/2/3/G、方向键微移、空格播放、Esc 取消/关闭
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            if (e.key === "Escape") {
                e.preventDefault();
                if (placementTask) return setPlacementTask(null);
                if (pathTask) return setPathTask(null);
                if (cameraPickTask) return setCameraPickTask(null);
                if (viewfinderOpen) return setViewfinderOpen(false);
                if (guideOpen) return setGuideOpen(false);
                if (shortcutsOpen) return setShortcutsOpen(false);
                if (exportModalOpen) return setExportModalOpen(false);
                if (unsavedDialogOpen) return setUnsavedDialogOpen(false);
                requestClose();
                return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                saveNow();
                return;
            }
            if (e.key === "0") selectTool("select");
            else if (e.key === "1") selectTool("translate");
            else if (e.key === "2") selectTool("rotate");
            else if (e.key === "3") selectTool("scale");
            else if (e.key.toLowerCase() === "g") dropSelectedToGround();
            else if (e.key === " " && draft.mode === "dynamic") {
                e.preventDefault();
                setPlaying((p) => !p);
            } else if (selected && !previewRevision && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                e.preventDefault();
                const delta = e.shiftKey ? 0.5 : 0.15;
                const dx = e.key === "ArrowRight" ? delta : e.key === "ArrowLeft" ? -delta : 0;
                const dz = e.key === "ArrowDown" ? delta : e.key === "ArrowUp" ? -delta : 0;
                if (selected.kind === "character") {
                    mutate((prev) => ({
                        ...prev,
                        characters: prev.characters.map((c) =>
                            c.id === selected.id
                                ? { ...c, position: [Number((c.position[0] + dx).toFixed(2)), c.position[1], Number((c.position[2] + dz).toFixed(2))] }
                                : c,
                        ),
                    }));
                } else if (selected.kind === "prop") {
                    mutate((prev) => ({
                        ...prev,
                        props: (prev.props || []).map((p) =>
                            p.id === selected.id
                                ? { ...p, position: [Number((p.position[0] + dx).toFixed(2)), p.position[1], Number((p.position[2] + dz).toFixed(2))] }
                                : p,
                        ),
                    }));
                }
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [
        open,
        placementTask,
        pathTask,
        cameraPickTask,
        viewfinderOpen,
        guideOpen,
        shortcutsOpen,
        exportModalOpen,
        unsavedDialogOpen,
        requestClose,
        saveNow,
        dropSelectedToGround,
        draft.mode,
        selected,
        selectTool,
        previewRevision,
        mutate,
    ]);

    const canvasImages = useMemo(
        () =>
            ctx
                .getNodes()
                .filter((n) => n.type === CanvasNodeType.Image && Boolean(n.metadata?.content))
                .map((n) => ({ id: n.id, title: n.title || "画布图片", url: n.metadata!.content! })),
        [ctx],
    );

    if (!open) return null;

    const softBorder = theme.glass.insetBorder;
    const viewSettings: DirectorViewSettings = { ...DEFAULT_VIEW_SETTINGS, ...(draft.viewSettings || {}) };

    // 切换静态/动态预演
    const handleModeSwitchClick = (targetMode: "static" | "dynamic") => {
        if (targetMode === (draft.mode || "static")) return;
        setPlaying(false);
        setPendingModeSwitch(targetMode);
    };

    const confirmModeSwitch = (syncCurrentToTarget: boolean) => {
        if (!pendingModeSwitch) return;
        const target = pendingModeSwitch;
        setPendingModeSwitch(null);
        mutate((prev) => {
            if (syncCurrentToTarget) {
                return { ...prev, mode: target, dynamicScene: extractSceneContent(prev) };
            }
            if (prev.dynamicScene) {
                const swapped = extractSceneContent(prev);
                const loaded = prev.dynamicScene;
                return {
                    ...prev,
                    mode: target,
                    characters: loaded.characters,
                    props: loaded.props,
                    cameras: loaded.cameras,
                    activeCameraId: loaded.activeCameraId,
                    environment: loaded.environment,
                    backgroundKind: loaded.backgroundKind,
                    panoramaUrl: loaded.backgroundUrl,
                    timeline: loaded.timeline,
                    dynamicScene: swapped,
                };
            }
            return { ...prev, mode: target };
        });
    };

    // 对象更新回调
    const updateCharacter = (id: string, patch: Partial<DirectorCharacterItem>) =>
        mutate((prev) => ({
            ...prev,
            characters: prev.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));

    const updateProp = (id: string, patch: Partial<DirectorPropItem>) =>
        mutate((prev) => ({
            ...prev,
            props: (prev.props || []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }));

    const updateCamera = (id: string, patch: Partial<DirectorCameraItem>) =>
        mutate((prev) => ({
            ...prev,
            cameras: prev.cameras.map((c) => (c.id === id ? { ...c, ...patch } : c)),
            aspectRatio: patch.aspectRatio || prev.aspectRatio,
        }));

    const updateEnvironment = (patch: Partial<DirectorEnvironment>) =>
        mutate((prev) => {
            const nextEnv = { ...(prev.environment || DIRECTOR_ENVIRONMENT_PRESETS.studio.env), ...patch };
            return { ...prev, environment: nextEnv, skyColor: nextEnv.backgroundColor };
        });

    const updateTimeline = (patch: Partial<DirectorTimelineState>) =>
        mutate((prev) => ({
            ...prev,
            timeline: { ...(prev.timeline || defaultTimelineState()), ...patch },
        }));

    const toggleKeyframe = (
        objectId: string,
        property: DirectorKeyframe["property"],
        value: DirectorKeyframe["value"],
    ) => {
        mutate((prev) => {
            const tl = prev.timeline || defaultTimelineState();
            const exists = tl.keyframes.find(
                (k) => k.objectId === objectId && k.property === property && Math.abs(k.time - currentTime) < 0.08,
            );
            const nextKfs = exists
                ? tl.keyframes.filter((k) => k.id !== exists.id)
                : [
                      ...tl.keyframes,
                      {
                          id: nanoid(),
                          time: Math.round(currentTime * 100) / 100,
                          objectId,
                          property,
                          value: Array.isArray(value) ? ([...value] as [number, number, number]) : value,
                      },
                  ];
            return { ...prev, timeline: { ...tl, keyframes: nextKfs } };
        });
    };

    // 地面点击放置角色或物体
    const handlePlaceAtPoint = (pt: [number, number, number]) => {
        if (!placementTask) return;
        if (placementTask.kind === "character") {
            const preset = resolveCharacterPreset(placementTask.bodyType);
            const item: DirectorCharacterItem = {
                id: nanoid(),
                name: placementTask.label,
                bodyType: placementTask.bodyType,
                position: pt,
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
                color: preset.defaultColor,
                defaultColor: preset.defaultColor,
                opacity: 100,
                visible: true,
                locked: false,
                pose: "自然站立",
                joints: emptyJoints(),
                autoFacePath: true,
                customAssetId: placementTask.customAssetId,
            };
            mutate((prev) => ({ ...prev, characters: [...prev.characters, item] }));
            setSelected({ kind: "character", id: item.id });
        } else {
            const def = ALL_PROP_PRESETS.find((p) => p.id === placementTask.presetId);
            const custom = placementTask.customAssetId
                ? (draft.customAssets || []).find((a) => a.id === placementTask.customAssetId)
                : undefined;
            const h = custom?.targetHeight || def?.height || 1.0;
            const item: DirectorPropItem = {
                id: nanoid(),
                name: `${placementTask.label} ${(draft.props?.length || 0) + 1}`,
                presetId: placementTask.presetId,
                category: def?.category || "自定义",
                baseHeight: h,
                dimensions: def ? [...def.dimensions] : [h * 0.7, h, h * 0.7],
                position: pt,
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
                color: def?.color || "#8d96a5",
                defaultColor: def?.color || "#8d96a5",
                opacity: 100,
                visible: true,
                locked: false,
                customAssetId: placementTask.customAssetId,
            };
            mutate((prev) => ({ ...prev, props: [...(prev.props || []), item] }));
            setSelected({ kind: "prop", id: item.id });
        }
        setPlacementTask(null);
    };

    // 机位预设选择：当前视角直接创建，单/双目标预设进入目标选择模式
    const handleSelectCameraPreset = (preset: DirectorCameraPreset) => {
        if (preset.kind === "current") {
            const pose = viewportRef.current?.getDirectorCameraPose() || { position: [0, 2.2, 7], target: [0, 1, 0], fov: 50 };
            const cam: DirectorCameraItem = {
                id: nanoid(),
                name: `机位 ${draft.cameras.length + 1}`,
                position: pose.position,
                target: pose.target,
                fov: pose.fov,
                roll: 0,
                aspectRatio: draft.aspectRatio,
                showTarget: true,
                lockTarget: false,
            };
            mutate((prev) => ({ ...prev, cameras: [...prev.cameras, cam], activeCameraId: cam.id, pipCameraId: cam.id }));
            setSelected({ kind: "camera", id: cam.id });
            return;
        }
        // 自动预选当前已选中的角色/物体或第一个角色
        const initial: string[] = [];
        if (selected?.kind === "character" || selected?.kind === "prop") initial.push(selected.id);
        else if (draft.characters[0]) initial.push(draft.characters[0].id);
        if (preset.kind === "dual" && draft.characters.length >= 2 && initial.length < 2) {
            const second = draft.characters.find((c) => !initial.includes(c.id));
            if (second) initial.push(second.id);
        }
        setCameraPickTask({
            presetId: preset.id,
            presetName: preset.name,
            dual: preset.kind === "dual",
            pickedIds: initial,
        });
    };

    const getEntityPos = (id: string): [number, number, number] => {
        const ch = draft.characters.find((c) => c.id === id);
        if (ch) return ch.position;
        const pr = (draft.props || []).find((p) => p.id === id);
        if (pr) return pr.position;
        return [0, 0, 0];
    };

    const confirmCameraPick = () => {
        if (!cameraPickTask) return;
        const def = DIRECTOR_CAMERA_PRESETS.find((c) => c.id === cameraPickTask.presetId);
        if (!def) return;
        const p0 = getEntityPos(cameraPickTask.pickedIds[0]);
        let position: [number, number, number] = [p0[0] + def.offset[0], p0[1] + def.offset[1], p0[2] + def.offset[2]];
        let target: [number, number, number] = [p0[0] + def.targetOffset[0], p0[1] + def.targetOffset[1], p0[2] + def.targetOffset[2]];

        if (def.kind === "dual" && cameraPickTask.pickedIds.length >= 2) {
            const p1 = getEntityPos(cameraPickTask.pickedIds[1]);
            const dirX = p1[0] - p0[0];
            const dirZ = p1[2] - p0[2];
            const len = Math.max(0.1, Math.hypot(dirX, dirZ));
            const nx = dirX / len;
            const nz = dirZ / len;
            position = [
                Number((p0[0] - nx * 1.15 - nz * 0.45).toFixed(2)),
                Number((p0[1] + 1.56).toFixed(2)),
                Number((p0[2] - nz * 1.15 + nx * 0.45).toFixed(2)),
            ];
            target = [Number(p1[0].toFixed(2)), Number((p1[1] + 1.42).toFixed(2)), Number(p1[2].toFixed(2))];
        }

        const cam: DirectorCameraItem = {
            id: nanoid(),
            name: `机位 ${draft.cameras.length + 1} · ${def.name}`,
            position,
            target,
            fov: def.fov,
            roll: def.roll || 0,
            aspectRatio: draft.aspectRatio,
            showTarget: true,
            lockTarget: false,
        };
        mutate((prev) => ({ ...prev, cameras: [...prev.cameras, cam], activeCameraId: cam.id, pipCameraId: cam.id }));
        setSelected({ kind: "camera", id: cam.id });
        setCameraPickTask(null);
    };

    // 确认 3D 路径绘制 -> 自动生成时间轴位置/注视点关键帧 & 行走动作片段
    const confirmPathDraw = () => {
        if (!pathTask || pathTask.points.length < 2) return;
        const tl = draft.timeline || defaultTimelineState();
        const span = Math.min(6, Math.max(2, tl.duration - currentTime));
        const prop: DirectorKeyframe["property"] = pathTask.kind === "camera_target" ? "target" : "position";
        const yKeep =
            pathTask.kind === "camera_pos"
                ? draft.cameras.find((c) => c.id === pathTask.objectId)?.position[1] ?? 1.8
                : pathTask.kind === "camera_target"
                  ? draft.cameras.find((c) => c.id === pathTask.objectId)?.target[1] ?? 1.2
                  : 0;

        const newKfs: DirectorKeyframe[] = pathTask.points.map((pt, i) => ({
            id: nanoid(),
            time: Math.round((currentTime + (i / (pathTask.points.length - 1)) * span) * 100) / 100,
            objectId: pathTask.objectId,
            property: prop,
            value: [pt[0], yKeep, pt[2]],
        }));

        mutate((prev) => {
            const curTl = prev.timeline || defaultTimelineState();
            const nextClips =
                pathTask.kind === "character_walk"
                    ? [
                          ...curTl.actionClips,
                          {
                              id: nanoid(),
                              characterId: pathTask.objectId,
                              actionId: "walk_normal",
                              actionName: "正常行走",
                              mode: "action" as const,
                              startTime: Math.round(currentTime * 100) / 100,
                              duration: span,
                          },
                      ]
                    : curTl.actionClips;
            return {
                ...prev,
                timeline: {
                    ...curTl,
                    keyframes: [...curTl.keyframes, ...newKfs],
                    actionClips: nextClips,
                },
            };
        });
        setPathTask(null);
    };

    // 复制/删除对象
    const duplicateEntity = (kind: "character" | "prop" | "camera", id: string) => {
        if (kind === "character") {
            const src = draft.characters.find((c) => c.id === id);
            if (!src) return;
            const copy: DirectorCharacterItem = {
                ...structuredClone(src),
                id: nanoid(),
                name: `${src.name} 副本`,
                position: [Number((src.position[0] + 0.9).toFixed(2)), src.position[1], src.position[2]],
            };
            mutate((prev) => ({ ...prev, characters: [...prev.characters, copy] }));
            setSelected({ kind: "character", id: copy.id });
        } else if (kind === "prop") {
            const src = (draft.props || []).find((p) => p.id === id);
            if (!src) return;
            const copy: DirectorPropItem = {
                ...structuredClone(src),
                id: nanoid(),
                name: `${src.name} 副本`,
                position: [Number((src.position[0] + 0.9).toFixed(2)), src.position[1], src.position[2]],
            };
            mutate((prev) => ({ ...prev, props: [...(prev.props || []), copy] }));
            setSelected({ kind: "prop", id: copy.id });
        } else {
            const src = draft.cameras.find((c) => c.id === id);
            if (!src) return;
            const copy: DirectorCameraItem = {
                ...structuredClone(src),
                id: nanoid(),
                name: `${src.name} 副本`,
                position: [Number((src.position[0] + 1.0).toFixed(2)), src.position[1], src.position[2]],
            };
            mutate((prev) => ({ ...prev, cameras: [...prev.cameras, copy] }));
            setSelected({ kind: "camera", id: copy.id });
        }
    };

    const deleteEntity = (kind: "character" | "prop" | "camera", id: string) => {
        if (kind === "character") {
            mutate((prev) => ({ ...prev, characters: prev.characters.filter((c) => c.id !== id) }));
        } else if (kind === "prop") {
            mutate((prev) => ({ ...prev, props: (prev.props || []).filter((p) => p.id !== id) }));
        } else if (draft.cameras.length > 1) {
            mutate((prev) => {
                const rest = prev.cameras.filter((c) => c.id !== id);
                return {
                    ...prev,
                    cameras: rest,
                    activeCameraId: prev.activeCameraId === id ? rest[0].id : prev.activeCameraId,
                    pipCameraId: prev.pipCameraId === id ? rest[0].id : prev.pipCameraId,
                };
            });
        }
        if (selected?.id === id) setSelected(null);
    };

    // 发送选中的镜头照片到无限画布并建立连线
    const sendSnapshotsToCanvas = async (snaps: DirectorSnapshot[]) => {
        if (!snaps.length || sending) return;
        setSending(true);
        try {
            const ops: Parameters<CanvasNodeContext["applyOps"]>[0] = [];
            const createdIds: string[] = [];
            const baseX = node.position.x + node.width + 110;
            const baseY = node.position.y;
            for (let i = 0; i < snaps.length; i++) {
                const snap = snaps[i];
                const uploaded = await uploadImage(snap.dataUrl);
                const size = fitNodeSize(uploaded.width, uploaded.height);
                const id = nanoid();
                createdIds.push(id);
                ops.push({
                    type: "add_node",
                    id,
                    nodeType: CanvasNodeType.Image,
                    title: snap.title,
                    position: { x: baseX + (i % 3) * (size.width + 28), y: baseY + Math.floor(i / 3) * (size.height + 40) },
                    ...size,
                    metadata: {
                        ...imageMetadata(uploaded),
                        prompt: `参考 3D 导演台构图与站位（${snap.cameraName}，${snap.aspectRatio}）：${draft.scenePrompt || ""}`,
                    },
                });
                ops.push({ type: "connect_nodes", fromNodeId: node.id, toNodeId: id });
            }
            ops.push({ type: "select_nodes", ids: createdIds });
            saveNow("发送镜头到画布");
            ctx.applyOps(ops);
            setMediaOpen(false);
            onClose();
        } finally {
            setSending(false);
        }
    };

    // 导出预演视频（下载或发送到无限画布视频节点）
    const handleExportVideo = async (opts: {
        source: "storyboard" | string;
        simplifiedCharacters: boolean;
        longEdge: 1280 | 1920;
        fps: number;
        destination: "download" | "canvas";
        onProgress: (pct: number) => void;
    }) => {
        if (!viewportRef.current) return;
        const blob = await viewportRef.current.exportVideoBlob({
            source: opts.source,
            simplifiedCharacters: opts.simplifiedCharacters,
            longEdge: opts.longEdge,
            fps: opts.fps,
            onProgress: opts.onProgress,
        });
        if (opts.destination === "download") {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `director-previs-${Date.now()}.webm`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            return;
        }
        const uploaded = await uploadMediaFile(blob, "video");
        const size = fitNodeSize(uploaded.width || 1280, uploaded.height || 720);
        const id = nanoid();
        saveNow("导出预演视频到画布");
        ctx.applyOps([
            {
                type: "add_node",
                id,
                nodeType: CanvasNodeType.Video,
                title: "导演台动态预演",
                position: { x: node.position.x + node.width + 110, y: node.position.y },
                ...size,
                metadata: {
                    ...videoMetadata(uploaded),
                    prompt: draft.scenePrompt || "3D 导演台动态预演参考视频",
                },
            },
            { type: "connect_nodes", fromNodeId: node.id, toNodeId: id },
            { type: "select_nodes", ids: [id] },
        ]);
        onClose();
    };

    return createPortal(
        <div
            data-canvas-overlay
            data-canvas-no-zoom
            data-canvas-shortcuts-ignore
            role="dialog"
            aria-label="兔子画布 3D 导演台"
            className="fixed inset-0 z-[140] flex flex-col overflow-hidden text-xs"
            style={{ backgroundColor: theme.canvas.background, color: theme.node.text }}
            onPointerDown={stop}
            onMouseDown={stop}
            onWheel={stop}
        >
            {/* 顶部玻璃栏（BlinkFlow 专属翡翠绿视觉） */}
            <header
                className="z-30 flex h-12 shrink-0 items-center justify-between border-b px-3.5"
                style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, borderColor: softBorder }}
            >
                {/* 左侧：品牌标题 + 快捷键 + 修订记录 + 保存 */}
                <div className="flex items-center gap-1.5">
                    <span
                        className="flex size-7 items-center justify-center rounded-xl text-white shadow-sm"
                        style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                    >
                        <Clapperboard className="size-3.5" />
                    </span>
                    <span className="mr-1 text-sm font-bold tracking-tight">3D 导演台</span>

                    <button
                        type="button"
                        title="快捷键与鼠标操作"
                        className="grid size-7 place-items-center rounded-lg transition hover:bg-white/10"
                        style={{ color: theme.node.muted }}
                        onClick={() => setShortcutsOpen(true)}
                    >
                        <CircleHelp className="size-4" />
                    </button>
                    <button
                        type="button"
                        title="修订记录"
                        className="grid size-7 place-items-center rounded-lg transition hover:bg-white/10"
                        style={{ color: revisionsOpen ? theme.accent.base : theme.node.muted }}
                        onClick={() => setRevisionsOpen((v) => !v)}
                    >
                        <History className="size-4" />
                    </button>
                    <button
                        type="button"
                        title="保存当前场景 (Ctrl+S)"
                        className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 font-medium transition hover:bg-white/10"
                        style={{ color: dirty ? theme.accent.base : theme.node.muted }}
                        onClick={() => saveNow()}
                    >
                        <Save className="size-3.5" />
                        <span>{dirty ? "未保存" : "已保存"}</span>
                    </button>
                </div>

                {/* 居中：静态预演 / 动态预演 胶囊切换 */}
                <div className="inline-flex items-center gap-1 rounded-xl border p-0.5" style={{ borderColor: softBorder, background: theme.glass.inset }}>
                    {(
                        [
                            ["static", "静态预演"],
                            ["dynamic", "动态预演"],
                        ] as const
                    ).map(([m, label]) => {
                        const active = (draft.mode || "static") === m;
                        return (
                            <button
                                key={m}
                                type="button"
                                className="rounded-lg px-3.5 py-1 text-xs font-semibold transition"
                                style={
                                    active
                                        ? {
                                              background: "linear-gradient(135deg,#0ea977,#12896a)",
                                              color: "#ffffff",
                                              boxShadow: "0 2px 10px rgba(14,169,119,0.28)",
                                          }
                                        : { color: theme.node.muted }
                                }
                                onClick={() => handleModeSwitchClick(m)}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>

                {/* 右侧：导出视频（动态模式） + 拍摄 + 镜头素材 + 返回画布 */}
                <div className="flex items-center gap-2">
                    {draft.mode === "dynamic" && (
                        <button
                            type="button"
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 font-semibold transition hover:border-[#37d39b]"
                            style={{ borderColor: softBorder, background: theme.node.panel, color: theme.node.text }}
                            onClick={() => setExportModalOpen(true)}
                        >
                            <Download className="size-3.5" style={{ color: theme.accent.base }} />
                            导出视频
                        </button>
                    )}

                    <div className="flex items-center gap-1 rounded-xl border p-0.5" style={{ borderColor: softBorder, background: theme.glass.inset }}>
                        <button
                            type="button"
                            className="inline-flex h-7 items-center gap-1.5 rounded-lg px-3 font-semibold transition"
                            style={
                                viewfinderOpen
                                    ? { background: theme.accent.soft, color: theme.accent.base }
                                    : { color: theme.node.text }
                            }
                            onClick={() => setViewfinderOpen((v) => !v)}
                        >
                            <Camera className="size-3.5" style={{ color: theme.accent.base }} />
                            拍摄
                        </button>
                        <button
                            type="button"
                            className="relative inline-flex h-7 items-center gap-1.5 rounded-lg px-3 font-semibold transition hover:bg-white/10"
                            style={mediaOpen ? { background: theme.accent.soft, color: theme.accent.base } : { color: theme.node.text }}
                            onClick={() => setMediaOpen((v) => !v)}
                        >
                            <Images className="size-3.5" />
                            镜头素材
                            {draft.snapshots.length > 0 && (
                                <span
                                    className="rounded-full px-1.5 py-0.2 font-mono text-[10px] font-bold text-white"
                                    style={{ background: theme.accent.base }}
                                >
                                    {draft.snapshots.length}
                                </span>
                            )}
                        </button>
                    </div>

                    {!inspectorOpen && (
                        <button
                            type="button"
                            title="展开对象与属性面板"
                            className="grid size-8 place-items-center rounded-xl border hover:border-[#37d39b]"
                            style={{ borderColor: softBorder, background: theme.node.panel }}
                            onClick={() => setInspectorOpen(true)}
                        >
                            <PanelRightOpen className="size-4" />
                        </button>
                    )}

                    <button
                        type="button"
                        title="返回画布"
                        className="grid size-8 place-items-center rounded-xl transition hover:bg-white/10"
                        style={{ color: theme.node.muted }}
                        onClick={requestClose}
                    >
                        <X className="size-4" />
                    </button>
                </div>
            </header>

            {/* 修订版本只读预览横幅 */}
            {previewRevision && (
                <div
                    className="z-20 flex items-center justify-center gap-3 border-b px-4 py-1.5 text-xs"
                    style={{ background: "rgba(14,169,119,0.16)", borderColor: theme.accent.base }}
                >
                    <span>
                        正在只读预览历史版本：<strong>{previewRevision.label}</strong>（{new Date(previewRevision.savedAt).toLocaleString()}）
                    </span>
                    <button
                        type="button"
                        className="rounded-lg px-3 py-1 font-semibold text-white"
                        style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                        onClick={() => {
                            const sc = previewRevision.scene;
                            mutate((prev) => ({
                                ...prev,
                                characters: structuredClone(sc.characters),
                                props: structuredClone(sc.props),
                                cameras: structuredClone(sc.cameras),
                                activeCameraId: sc.activeCameraId,
                                environment: structuredClone(sc.environment),
                                backgroundKind: sc.backgroundKind,
                                panoramaUrl: sc.backgroundUrl,
                                timeline: structuredClone(sc.timeline),
                            }));
                            setPreviewRevision(null);
                            setRevisionsOpen(false);
                        }}
                    >
                        恢复此版本
                    </button>
                    <button type="button" className="rounded-lg bg-white/10 px-2.5 py-1 hover:bg-white/20" onClick={() => setPreviewRevision(null)}>
                        退出预览
                    </button>
                </div>
            )}

            {/* 主工作区：左浮动工具栏 + 资产抽屉 + 中央 3D 舞台 + 右检查器 */}
            <div className="relative flex min-h-0 flex-1 overflow-hidden">
                {/* 左侧竖向浮动工具条 */}
                <div className="pointer-events-none absolute top-3 left-3 z-20 flex flex-col gap-2">
                    <button
                        type="button"
                        title="资产库（角色 / 物体 / 背景 / 机位）"
                        className="pointer-events-auto grid size-10 place-items-center rounded-2xl border shadow-xl transition hover:border-[#37d39b]"
                        style={{
                            ...canvasGlass(theme),
                            backgroundColor: assetOpen ? theme.accent.soft : theme.toolbar.panel,
                            borderColor: assetOpen ? theme.accent.base : theme.glass.border,
                            color: assetOpen ? theme.accent.base : theme.node.text,
                        }}
                        onClick={() => setAssetOpen((v) => !v)}
                    >
                        <Box className="size-4" />
                    </button>

                    <div
                        className="pointer-events-auto flex flex-col gap-1 rounded-2xl border p-1 shadow-xl"
                        style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel }}
                    >
                        {(
                            [
                                ["select", "选择 · 0", MousePointer2, "0"],
                                ["translate", "移动 · 1", Move, "1"],
                                ["rotate", "旋转 · 2", RotateCw, "2"],
                                ["scale", "缩放 · 3", Scaling, "3"],
                            ] as const
                        ).map(([id, tip, Icon, keyHint]) => {
                            const active = tool === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    title={tip}
                                    className="relative grid size-8 place-items-center rounded-xl transition hover:bg-white/10"
                                    style={active ? { background: theme.accent.soft, color: theme.accent.base } : { color: theme.node.muted }}
                                    onClick={() => selectTool(id)}
                                >
                                    <Icon className="size-4" />
                                    <span className="absolute right-0.5 bottom-0.5 font-mono text-[8px] opacity-65">{keyHint}</span>
                                </button>
                            );
                        })}

                        <div className="my-0.5 h-px bg-white/10" />

                        <button
                            type="button"
                            title="落到地面 · G"
                            disabled={!selected || (selected.kind !== "character" && selected.kind !== "prop")}
                            className="relative grid size-8 place-items-center rounded-xl transition hover:bg-white/10 disabled:opacity-30"
                            style={{ color: theme.node.muted }}
                            onClick={dropSelectedToGround}
                        >
                            <ArrowDownToLine className="size-4" />
                            <span className="absolute right-0.5 bottom-0.5 font-mono text-[8px] opacity-65">G</span>
                        </button>

                        {/* 视图设置（7 项复选开关） */}
                        <div className="relative">
                            <button
                                type="button"
                                title="视图设置"
                                className="grid size-8 place-items-center rounded-xl transition hover:bg-white/10"
                                style={{ color: viewSettingsOpen ? theme.accent.base : theme.node.muted }}
                                onClick={() => setViewSettingsOpen((v) => !v)}
                            >
                                <Eye className="size-4" />
                            </button>
                            {viewSettingsOpen && (
                                <div
                                    className="absolute top-0 left-full z-40 ml-2 w-44 rounded-2xl border p-2 text-xs shadow-2xl"
                                    style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                                >
                                    <div className="mb-1.5 px-2 text-[11px] font-semibold" style={{ color: theme.node.muted }}>
                                        视图设置
                                    </div>
                                    {(
                                        [
                                            ["ground", "地面"],
                                            ["grid", "网格"],
                                            ["motionPaths", "运动路径"],
                                            ["objectNames", "对象名称"],
                                            ["heightGuides", "对象高度参考线"],
                                            ["cameraFrameMask", "机位画幅遮罩"],
                                            ["viewIndicator", "视角指示器"],
                                        ] as const
                                    ).map(([k, lbl]) => {
                                        const checked = viewSettings[k];
                                        return (
                                            <button
                                                key={k}
                                                type="button"
                                                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-white/10"
                                                onClick={() =>
                                                    mutate((prev) => ({
                                                        ...prev,
                                                        viewSettings: {
                                                            ...DEFAULT_VIEW_SETTINGS,
                                                            ...(prev.viewSettings || {}),
                                                            [k]: !checked,
                                                        },
                                                    }))
                                                }
                                            >
                                                <span>{lbl}</span>
                                                <span
                                                    className="grid size-4 place-items-center rounded border"
                                                    style={{
                                                        borderColor: checked ? theme.accent.base : softBorder,
                                                        background: checked ? theme.accent.base : "transparent",
                                                        color: "#fff",
                                                    }}
                                                >
                                                    {checked && <Check className="size-3" />}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 资产抽屉（展开时位于左侧工具栏右侧） */}
                {assetOpen && (
                    <div className="pl-[56px]">
                        <DirectorAssetDrawer
                            theme={theme}
                            open={assetOpen}
                            state={displayState}
                            canvasImages={canvasImages}
                            onClose={() => setAssetOpen(false)}
                            onStartPlacement={(task) => setPlacementTask(task)}
                            onSelectCameraPreset={handleSelectCameraPreset}
                            onApplyBackground={(kind, url) =>
                                mutate((prev) => ({ ...prev, backgroundKind: kind, panoramaUrl: url }))
                            }
                            onAddBackgroundItem={(item: DirectorBackgroundItem) =>
                                mutate((prev) => ({ ...prev, backgrounds: [item, ...(prev.backgrounds || [])] }))
                            }
                            onAddCustomAsset={(asset: DirectorCustomAsset) =>
                                mutate((prev) => ({ ...prev, customAssets: [asset, ...(prev.customAssets || [])] }))
                            }
                        />
                    </div>
                )}

                {/* 中央 3D WebGL 舞台 + 画中画 + 分屏预览 + 取景器 + Agent 栏 */}
                <DirectorViewport
                    ref={viewportRef}
                    theme={theme}
                    state={displayState}
                    currentTime={currentTime}
                    tool={tool}
                    selected={selected}
                    poseEditMode={poseEditMode}
                    activeJointGroup={activeJointGroup}
                    viewfinderOpen={viewfinderOpen}
                    mainViewId={mainViewId}
                    onMainViewChange={setMainViewId}
                    onSelect={(sel) => {
                        setSelected(sel);
                        if (sel?.kind === "camera") {
                            mutate((prev) => ({ ...prev, activeCameraId: sel.id }));
                        }
                    }}
                    onSelectJointGroup={setActiveJointGroup}
                    onUpdateTransform={(kind, id, patch) => {
                        if (kind === "character") updateCharacter(id, patch);
                        else if (kind === "prop") updateProp(id, patch);
                        else if (kind === "camera" && patch.position) updateCamera(id, { position: patch.position });
                        else if (kind === "target" && patch.position) updateCamera(id, { target: patch.position });
                    }}
                    onChangePipCamera={(pipId) => mutate((prev) => ({ ...prev, pipCameraId: pipId }))}
                    onChangeAspectRatio={(ratio) => mutate((prev) => ({ ...prev, aspectRatio: ratio }))}
                    onCloseViewfinder={() => setViewfinderOpen(false)}
                    onTakeSnapshot={(snap) => {
                        mutate((prev) => ({ ...prev, snapshots: [snap, ...prev.snapshots].slice(0, 32) }));
                        setMediaOpen(true);
                    }}
                    placementTask={placementTask}
                    onPlaceAtPoint={handlePlaceAtPoint}
                    onCancelPlacement={() => setPlacementTask(null)}
                    pathTask={pathTask}
                    onAddPathPoint={(pt) => setPathTask((t) => (t ? { ...t, points: [...t.points, pt] } : null))}
                    onConfirmPath={confirmPathDraw}
                    onCancelPath={() => setPathTask(null)}
                    cameraPickTask={cameraPickTask}
                    onPickCameraTarget={(id) =>
                        setCameraPickTask((task) => {
                            if (!task) return null;
                            if (!task.dual) return { ...task, pickedIds: [id] };
                            const next = task.pickedIds.includes(id)
                                ? task.pickedIds
                                : [...task.pickedIds, id].slice(-2);
                            return { ...task, pickedIds: next };
                        })
                    }
                    onConfirmCameraPick={confirmCameraPick}
                    onCancelCameraPick={() => setCameraPickTask(null)}
                    onAgentSubmit={(prompt) => {
                        const res = applyDirectorAgentPrompt(draft, prompt);
                        setDraft(res.next);
                        setDirty(true);
                        setAgentFeedback(res.summary);
                        setTimeout(() => setAgentFeedback(""), 5500);
                    }}
                    onUploadBackgroundQuick={async (file) => {
                        const uploaded = await uploadImage(file);
                        const item: DirectorBackgroundItem = {
                            id: nanoid(),
                            name: file.name.replace(/\.[^.]+$/, ""),
                            kind: "panorama",
                            url: uploaded.url,
                            storageKey: uploaded.storageKey,
                            createdAt: Date.now(),
                        };
                        mutate((prev) => ({
                            ...prev,
                            backgroundKind: "panorama",
                            panoramaUrl: uploaded.url,
                            backgrounds: [item, ...(prev.backgrounds || [])],
                        }));
                    }}
                    agentFeedback={agentFeedback}
                    readOnly={Boolean(previewRevision)}
                />

                {/* 右侧对象大纲与属性检查器 */}
                {inspectorOpen && (
                    <DirectorInspector
                        theme={theme}
                        state={displayState}
                        selected={selected}
                        currentTime={currentTime}
                        poseEditMode={poseEditMode}
                        activeJointGroup={activeJointGroup}
                        onSelect={(sel) => {
                            setSelected(sel);
                            if (sel?.kind === "camera") mutate((prev) => ({ ...prev, activeCameraId: sel.id }));
                        }}
                        onCollapse={() => setInspectorOpen(false)}
                        onFocusPosition={(pos) => viewportRef.current?.focusObject(pos)}
                        onSetPipCamera={(camId) => mutate((prev) => ({ ...prev, pipCameraId: camId }))}
                        onDuplicateEntity={duplicateEntity}
                        onDeleteEntity={deleteEntity}
                        onUpdateCharacter={updateCharacter}
                        onUpdateProp={updateProp}
                        onUpdateCamera={updateCamera}
                        onUpdateEnvironment={updateEnvironment}
                        onTogglePoseEditMode={setPoseEditMode}
                        onSelectJointGroup={setActiveJointGroup}
                        onAddCustomAction={(act: DirectorCustomAction) =>
                            mutate((prev) => ({ ...prev, customActions: [act, ...(prev.customActions || [])] }))
                        }
                        onToggleKeyframe={toggleKeyframe}
                    />
                )}
            </div>

            {/* 动态预演底部时间轴与分镜编排 */}
            {displayState.mode === "dynamic" && (
                <DirectorTimeline
                    theme={theme}
                    state={displayState}
                    currentTime={currentTime}
                    playing={playing}
                    onSeek={(t) => {
                        setPlaying(false);
                        setCurrentTime(t);
                    }}
                    onTogglePlay={() => setPlaying((p) => !p)}
                    onUpdateTimeline={updateTimeline}
                    onUpdateCharacter={updateCharacter}
                    onStartPathDraw={(kind, objectId, label) => setPathTask({ kind, objectId, label, points: [] })}
                    onToggleKeyframe={toggleKeyframe}
                />
            )}

            {/* 各类弹窗与抽屉 */}
            {guideOpen && <DirectorViewGuideModal theme={theme} onClose={() => setGuideOpen(false)} />}
            {shortcutsOpen && <DirectorShortcutsModal theme={theme} onClose={() => setShortcutsOpen(false)} />}

            {revisionsOpen && (
                <DirectorRevisionsDrawer
                    theme={theme}
                    revisions={draft.revisions || []}
                    previewRevisionId={previewRevision?.id || null}
                    onPreview={setPreviewRevision}
                    onRestore={(rev) => {
                        const sc = rev.scene;
                        mutate((prev) => ({
                            ...prev,
                            characters: structuredClone(sc.characters),
                            props: structuredClone(sc.props),
                            cameras: structuredClone(sc.cameras),
                            activeCameraId: sc.activeCameraId,
                            environment: structuredClone(sc.environment),
                            backgroundKind: sc.backgroundKind,
                            panoramaUrl: sc.backgroundUrl,
                            timeline: structuredClone(sc.timeline),
                        }));
                        setPreviewRevision(null);
                        setRevisionsOpen(false);
                    }}
                    onClose={() => setRevisionsOpen(false)}
                />
            )}

            {mediaOpen && (
                <DirectorMediaDrawer
                    theme={theme}
                    snapshots={draft.snapshots}
                    sending={sending}
                    onDeleteIds={(ids) =>
                        mutate((prev) => ({ ...prev, snapshots: prev.snapshots.filter((s) => !ids.includes(s.id)) }))
                    }
                    onAddToCanvas={sendSnapshotsToCanvas}
                    onClose={() => setMediaOpen(false)}
                />
            )}

            {exportModalOpen && (
                <DirectorExportVideoModal
                    theme={theme}
                    state={displayState}
                    onExport={handleExportVideo}
                    onClose={() => setExportModalOpen(false)}
                />
            )}

            {/* 切换静态/动态预演同步确认弹窗 */}
            {pendingModeSwitch && (
                <div
                    className="fixed inset-0 z-[175] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.target === e.currentTarget) setPendingModeSwitch(null);
                    }}
                >
                    <div
                        className="w-full max-w-sm space-y-4 rounded-2xl border p-5 text-xs shadow-2xl"
                        style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                    >
                        <div className="text-sm font-semibold">
                            同步当前场景到「{pendingModeSwitch === "dynamic" ? "动态预演" : "静态预演"}」？
                        </div>
                        <p className="leading-relaxed" style={{ color: theme.node.muted }}>
                            你可以用当前的角色、物体、灯光与机位覆盖目标模式，或保留目标模式原有场景直接切换。
                        </p>
                        <div className="flex justify-end gap-2">
                            <button type="button" className="h-8 rounded-xl border px-3" style={{ borderColor: softBorder }} onClick={() => setPendingModeSwitch(null)}>
                                取消
                            </button>
                            <button type="button" className="h-8 rounded-xl border px-3 hover:border-[#37d39b]" style={{ borderColor: softBorder }} onClick={() => confirmModeSwitch(false)}>
                                不同步，直接切换
                            </button>
                            <button
                                type="button"
                                className="h-8 rounded-xl px-3.5 font-semibold text-white"
                                style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                                onClick={() => confirmModeSwitch(true)}
                            >
                                覆盖并切换
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 未保存更改退出确认弹窗 */}
            {unsavedDialogOpen && (
                <div
                    className="fixed inset-0 z-[175] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.target === e.currentTarget) setUnsavedDialogOpen(false);
                    }}
                >
                    <div
                        className="w-full max-w-sm space-y-4 rounded-2xl border p-5 text-xs shadow-2xl"
                        style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                    >
                        <div className="text-sm font-semibold">保存更改？</div>
                        <p className="leading-relaxed" style={{ color: theme.node.muted }}>
                            当前 3D 导演台有尚未保存的修改，离开前是否保存到节点与修订记录？
                        </p>
                        <div className="flex justify-end gap-2">
                            <button type="button" className="h-8 rounded-xl border px-3" style={{ borderColor: softBorder }} onClick={() => setUnsavedDialogOpen(false)}>
                                继续编辑
                            </button>
                            <button
                                type="button"
                                className="h-8 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-red-400"
                                onClick={() => {
                                    setUnsavedDialogOpen(false);
                                    onClose();
                                }}
                            >
                                直接关闭
                            </button>
                            <button
                                type="button"
                                className="h-8 rounded-xl px-3.5 font-semibold text-white"
                                style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                                onClick={() => {
                                    saveNow();
                                    setUnsavedDialogOpen(false);
                                    onClose();
                                }}
                            >
                                保存并关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body,
    );
}

/** 无限画布上的「导演台」节点卡片（兔子画布专属磨砂玻璃 + 翡翠绿风格） */
function DirectorNodeContent({ ctx }: { ctx: CanvasNodeContext }) {
    const { theme, node } = ctx;
    const data = readDirectorState(node);
    const [open, setOpen] = useState(false);

    const persistData = (next: DirectorStageState) => {
        ctx.updateMetadata({ directorData: next });
    };

    const objCount = (data.props || []).length;

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-between overflow-hidden rounded-[22px] p-5 text-center text-xs"
            style={{ background: theme.node.panel, color: theme.node.text }}
        >
            {/* 顶部状态徽章 */}
            <div className="flex w-full items-center justify-between text-[11px]" style={{ color: theme.node.muted }}>
                <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: theme.node.text }}>
                    <span className="size-2 rounded-full bg-[#37d39b]" />
                    {data.mode === "dynamic" ? "动态预演" : "静态预演"}
                </span>
                <span className="rounded-full px-2 py-0.5 font-mono text-[10px]" style={{ background: theme.glass.inset }}>
                    {data.characters.length} 角色 · {objCount} 物体 · {data.cameras.length} 机位
                </span>
            </div>

            {/* 中央 3D 视觉主区或已拍镜头缩略 */}
            {data.snapshots.length > 0 ? (
                <div className="my-2 grid w-full flex-1 grid-cols-2 gap-1.5 overflow-hidden">
                    {data.snapshots.slice(0, 4).map((snap) => (
                        <div key={snap.id} className="relative overflow-hidden rounded-xl border" style={{ borderColor: theme.glass.insetBorder }}>
                            <img src={snap.dataUrl} alt={snap.title} className="h-full w-full object-cover" />
                            <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                                {snap.title}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="my-auto flex flex-col items-center gap-3 py-3">
                    <div
                        className="relative grid size-16 place-items-center rounded-2xl border shadow-lg"
                        style={{
                            background: theme.accent.soft,
                            borderColor: `${theme.accent.base}55`,
                            color: theme.accent.base,
                        }}
                    >
                        <Box className="size-8" />
                        <Film className="absolute -right-1.5 -bottom-1.5 size-4 rounded-full bg-[#0ea977] p-0.5 text-white" />
                    </div>
                    <div className="max-w-[230px] text-[12px] leading-relaxed" style={{ color: theme.node.muted }}>
                        在 3D 空间中设计角色、机位与镜头
                    </div>
                </div>
            )}

            {/* 底部主操作按钮 */}
            <button
                type="button"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-semibold text-white shadow-md transition hover:brightness-110"
                style={{
                    background: "linear-gradient(135deg, #0ea977, #12896a)",
                    boxShadow: "0 6px 20px rgba(14,169,119,0.28)",
                }}
                onMouseDown={stopWorkflowControlDrag}
                onPointerDown={stopWorkflowControlDrag}
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen(true);
                }}
            >
                <Clapperboard className="size-4" />
                进入导演台
            </button>

            <DirectorStageModal
                open={open}
                ctx={ctx}
                persisted={data}
                onPersist={persistData}
                onClose={() => setOpen(false)}
            />
        </div>
    );
}

export const directorStageNodeDefinition: CanvasNodeDefinition = {
    type: DIRECTOR_NODE_TYPE,
    title: "导演台",
    description: "在 3D 空间中设计角色、机位、灯光与动态运镜",
    icon: <Box className="size-4" />,
    minimapColor: "#0ea977",
    defaultSize: { width: 320, height: 320 },
    defaultMetadata: { directorData: defaultDirectorState() },
    hidePanel: true,
    hasSourceHandle: true,
    Content: DirectorNodeContent,
};

// 保留 toScale3 引用确保 tree-shake 一致
void toScale3;
