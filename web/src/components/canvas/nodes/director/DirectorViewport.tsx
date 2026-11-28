import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
    Camera,
    ChevronDown,
    ChevronUp,
    Columns2,
    Compass,
    GripVertical,
    Maximize2,
    RotateCcw,
    Sparkles,
    Upload,
    X,
} from "lucide-react";
import { nanoid } from "nanoid";
import { canvasGlass, type CanvasTheme } from "@/lib/canvas-theme";
import {
    DEFAULT_VIEW_SETTINGS,
    DIRECTOR_ASPECT_RATIOS,
    DIRECTOR_ENVIRONMENT_PRESETS,
    resolveCharacterPreset,
} from "@/lib/canvas/director/presets";
import {
    buildCameraAndTargetGizmo,
    buildDirectorMannequin,
    buildDirectorProp,
    evaluateSceneAtTime,
    loadCustomAssetModel,
    toScale3,
} from "@/lib/canvas/director/scene-builders";
import type {
    DirectorCameraItem,
    DirectorCharacterItem,
    DirectorPropItem,
    DirectorSnapshot,
    DirectorStageState,
    DirectorViewSettings,
} from "@/types/canvas";

export type TransformTool = "select" | "translate" | "rotate" | "scale";
export type SelectedEntity = { kind: "character" | "prop" | "camera" | "target"; id: string } | null;

export type PlacementTask =
    | { kind: "character"; bodyType: DirectorCharacterItem["bodyType"]; label: string; customAssetId?: string }
    | { kind: "prop"; presetId: string; label: string; customAssetId?: string };

export type PathDrawTask = {
    kind: "camera_pos" | "camera_target" | "character_walk" | "character_move";
    objectId: string;
    label: string;
    points: [number, number, number][];
};

export type CameraTargetPickTask = {
    presetId: string;
    presetName: string;
    dual: boolean;
    pickedIds: string[];
};

export type DirectorViewportHandle = {
    focusObject: (pos: [number, number, number]) => void;
    resetView: () => void;
    getDirectorCameraPose: () => { position: [number, number, number]; target: [number, number, number]; fov: number };
    captureView: (sourceId: "director" | string, aspectRatio?: string) => DirectorSnapshot | null;
    exportVideoBlob: (opts: {
        source: "storyboard" | string;
        simplifiedCharacters: boolean;
        longEdge: 1280 | 1920;
        fps: number;
        onProgress?: (pct: number) => void;
    }) => Promise<Blob>;
};

type Props = {
    theme: CanvasTheme;
    state: DirectorStageState;
    currentTime: number;
    tool: TransformTool;
    selected: SelectedEntity;
    poseEditMode: boolean;
    activeJointGroup: string;
    viewfinderOpen: boolean;
    mainViewId: "director" | string;
    onMainViewChange: (id: "director" | string) => void;
    onSelect: (sel: SelectedEntity) => void;
    onSelectJointGroup: (groupId: string) => void;
    onUpdateTransform: (
        kind: "character" | "prop" | "camera" | "target",
        id: string,
        patch: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] },
    ) => void;
    onChangePipCamera: (pipId: string) => void;
    onChangeAspectRatio: (ratio: string) => void;
    onCloseViewfinder: () => void;
    onTakeSnapshot: (snap: DirectorSnapshot) => void;
    placementTask: PlacementTask | null;
    onPlaceAtPoint: (point: [number, number, number]) => void;
    onCancelPlacement: () => void;
    pathTask: PathDrawTask | null;
    onAddPathPoint: (point: [number, number, number]) => void;
    onConfirmPath: () => void;
    onCancelPath: () => void;
    cameraPickTask: CameraTargetPickTask | null;
    onPickCameraTarget: (id: string) => void;
    onConfirmCameraPick: () => void;
    onCancelCameraPick: () => void;
    onAgentSubmit: (prompt: string) => void;
    onUploadBackgroundQuick: (file: File) => void;
    agentFeedback?: string;
    readOnly?: boolean;
};

const deg = (v: number) => (v * Math.PI) / 180;
const radToDeg = (v: number) => Math.round(((v * 180) / Math.PI) * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

function ratioNumber(value?: string) {
    return DIRECTOR_ASPECT_RATIOS.find((r) => r.value === value)?.ratio || 16 / 9;
}

/** 将可见角色（及物体）头顶名称以与 3D 视口一致的精致胶囊样式绘制到 2D 画布上，并自动防重叠避让 */
function drawBakedObjectLabels(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    cam: THREE.PerspectiveCamera,
    characters: DirectorCharacterItem[],
    props: DirectorPropItem[],
) {
    cam.updateMatrixWorld();
    const vec = new THREE.Vector3();
    // 字号对齐 3D 视口中的 10-12px 精巧比例（720p 下约 13px），不再过大遮挡
    const fontSize = Math.max(10, Math.round(height * 0.0175));
    const padX = Math.round(fontSize * 0.68);
    const padY = Math.round(fontSize * 0.34);
    ctx.save();
    ctx.font = `600 ${fontSize}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    type PlacedLabel = {
        text: string;
        anchorX: number;
        anchorY: number;
        x: number;
        y: number;
        w: number;
        h: number;
        depth: number;
    };
    const items: PlacedLabel[] = [];

    const collect = (text: string, worldPos: [number, number, number]) => {
        if (!text.trim()) return;
        vec.set(worldPos[0], worldPos[1], worldPos[2]).project(cam);
        if (vec.z >= 1 || vec.z <= -1) return;
        const x = (vec.x * 0.5 + 0.5) * width;
        const y = (-vec.y * 0.5 + 0.5) * height;
        if (x < -40 || x > width + 40 || y < -20 || y > height + 20) return;
        const textW = ctx.measureText(text).width;
        const boxW = textW + padX * 2;
        const boxH = fontSize + padY * 2;
        const ry = Math.max(6, y - boxH - Math.round(fontSize * 0.45));
        items.push({ text, anchorX: x, anchorY: y, x: x - boxW / 2, y: ry, w: boxW, h: boxH, depth: vec.z });
    };

    characters.forEach((ch) => {
        if (ch.visible === false) return;
        const preset = resolveCharacterPreset(ch.bodyType);
        const sc = toScale3(ch.scale);
        collect(ch.name, [ch.position[0], ch.position[1] + preset.heightM * sc[1] + 0.22, ch.position[2]]);
    });
    props.forEach((pr) => {
        if (pr.visible === false) return;
        collect(pr.name, [pr.position[0], pr.position[1] + pr.dimensions[1] * pr.scale[1] + 0.18, pr.position[2]]);
    });

    // 从近到远放置，并检测 2D 碰撞：若与已有胶囊重叠则自动向上错开，保证绝不互盖
    items.sort((a, b) => a.depth - b.depth);
    const placed: PlacedLabel[] = [];
    const gapX = 6;
    const gapY = 4;
    for (const item of items) {
        let guard = 0;
        while (
            guard < 8 &&
            placed.some(
                (other) =>
                    item.x < other.x + other.w + gapX &&
                    item.x + item.w + gapX > other.x &&
                    item.y < other.y + other.h + gapY &&
                    item.y + item.h + gapY > other.y,
            )
        ) {
            item.y = Math.max(6, item.y - (item.h + gapY));
            guard++;
        }
        placed.push(item);
    }

    // 绘制精致胶囊（与 3D 视口内 HTML 标牌风格一致）
    for (const item of placed) {
        const cx = item.x + item.w / 2;
        const bottomY = item.y + item.h;
        // 如果为了防重叠被上移较多，画一条极细的引导线指回人物头顶
        if (item.anchorY - bottomY > fontSize * 1.4) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx, bottomY);
            ctx.lineTo(item.anchorX, item.anchorY - 4);
            ctx.stroke();
        }
        const r = item.h / 2;
        ctx.fillStyle = "rgba(15, 18, 24, 0.72)";
        ctx.beginPath();
        ctx.roundRect(item.x, item.y, item.w, item.h, r);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = "#f4f6f9";
        ctx.fillText(item.text, cx, item.y + item.h / 2 + 0.5);
    }
    ctx.restore();
}

export const DirectorViewport = forwardRef<DirectorViewportHandle, Props>(function DirectorViewport(props, ref) {
    const {
        theme,
        state,
        currentTime,
        tool,
        selected,
        poseEditMode,
        activeJointGroup,
        viewfinderOpen,
        mainViewId,
        onMainViewChange,
        onSelect,
        onSelectJointGroup,
        onUpdateTransform,
        onChangePipCamera,
        onChangeAspectRatio,
        onCloseViewfinder,
        onTakeSnapshot,
        placementTask,
        onPlaceAtPoint,
        onCancelPlacement,
        pathTask,
        onAddPathPoint,
        onConfirmPath,
        onCancelPath,
        cameraPickTask,
        onPickCameraTarget,
        onConfirmCameraPick,
        onCancelCameraPick,
        onAgentSubmit,
        onUploadBackgroundQuick,
        agentFeedback,
        readOnly,
    } = props;

    const mountRef = useRef<HTMLDivElement>(null);
    const pipCanvasRef = useRef<HTMLCanvasElement>(null);
    const splitCanvasRef = useRef<HTMLCanvasElement>(null);
    const uploadRef = useRef<HTMLInputElement>(null);

    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const directorCamRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const transformRef = useRef<TransformControls | null>(null);
    const dynamicGroupRef = useRef<THREE.Group | null>(null);
    const helperGroupRef = useRef<THREE.Group | null>(null);
    const lightsRef = useRef<{
        ambient: THREE.HemisphereLight;
        key: THREE.DirectionalLight;
        fill: THREE.DirectionalLight;
        rim: THREE.DirectionalLight;
    } | null>(null);
    const groundRef = useRef<THREE.Mesh | null>(null);
    const gridRef = useRef<THREE.GridHelper | null>(null);
    const bgMeshRef = useRef<THREE.Mesh | null>(null);
    const objectMapRef = useRef<Map<string, THREE.Object3D>>(new Map());
    const customModelsRef = useRef<Map<string, THREE.Object3D>>(new Map());

    const [directorFov, setDirectorFov] = useState(50);
    const [pipCollapsed, setPipCollapsed] = useState(false);
    const [splitPreview, setSplitPreview] = useState(false);
    const [splitRatio, setSplitRatio] = useState(0.54);
    const [pipPos, setPipPos] = useState({ x: 16, y: 16 });
    const [pipWidth, setPipWidth] = useState(268);
    const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
    const [pipDropdownOpen, setPipDropdownOpen] = useState(false);
    const [agentInput, setAgentInput] = useState("");
    const [modelTick, setModelTick] = useState(0);
    const [projectedLabels, setProjectedLabels] = useState<
        Array<{ id: string; text: string; heightText?: string; x: number; y: number; active: boolean }>
    >([]);
    const [axisDirs, setAxisDirs] = useState<{ x: [number, number]; y: [number, number]; z: [number, number] }>({
        x: [1, 0],
        y: [0, -1],
        z: [-0.6, 0.5],
    });

    const viewSettings: DirectorViewSettings = { ...DEFAULT_VIEW_SETTINGS, ...(state.viewSettings || {}) };
    const env = state.environment || DIRECTOR_ENVIRONMENT_PRESETS.studio.env;
    const evaluated = useMemo(
        () => evaluateSceneAtTime(state, currentTime, state.customActions || []),
        [state, currentTime],
    );

    // 预加载所有自定义导入的 GLB/GLTF/FBX 3D 模型
    useEffect(() => {
        let alive = true;
        (state.customAssets || []).forEach((asset) => {
            if (!customModelsRef.current.has(asset.id) && asset.url) {
                loadCustomAssetModel(asset).then((model) => {
                    if (model && alive) {
                        customModelsRef.current.set(asset.id, model);
                        setModelTick((t) => t + 1);
                    }
                });
            }
        });
        return () => {
            alive = false;
        };
    }, [state.customAssets]);

    // 用于动画循环中读取最新 React 状态
    const liveRef = useRef({
        mainViewId,
        pipCameraId: state.pipCameraId || state.activeCameraId || state.cameras[0]?.id || "storyboard",
        splitPreview,
        pipCollapsed,
        viewSettings,
        evaluated,
        selected,
        state,
        onUpdateTransform,
    });
    liveRef.current = {
        mainViewId,
        pipCameraId: state.pipCameraId || state.activeCameraId || state.cameras[0]?.id || "storyboard",
        splitPreview,
        pipCollapsed,
        viewSettings,
        evaluated,
        selected,
        state,
        onUpdateTransform,
    };
    const wasGizmoDraggingRef = useRef(false);

    const makePerspectiveFromCamera = useCallback((cam: DirectorCameraItem, aspect: number) => {
        const pCam = new THREE.PerspectiveCamera(cam.fov || 50, Math.max(0.2, aspect), 0.08, 160);
        pCam.position.set(cam.position[0], cam.position[1], cam.position[2]);
        pCam.lookAt(cam.target[0], cam.target[1], cam.target[2]);
        if (cam.roll) pCam.rotateZ(deg(cam.roll));
        pCam.updateProjectionMatrix();
        return pCam;
    }, []);

    // 初始化 Three.js WebGL 场景
    useEffect(() => {
        const container = mountRef.current;
        if (!container) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#171717");
        sceneRef.current = scene;

        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(Math.max(200, container.clientWidth), Math.max(200, container.clientHeight));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        container.innerHTML = "";
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const dirCam = new THREE.PerspectiveCamera(
            50,
            Math.max(200, container.clientWidth) / Math.max(200, container.clientHeight),
            0.08,
            180,
        );
        dirCam.position.set(5.4, 3.6, 6.8);
        directorCamRef.current = dirCam;

        // 必须先初始化 TransformControls 再初始化 OrbitControls，
        // 确保点击 XYZ 箭头/旋转环/缩放手柄时 TransformControls 先接管指针并禁用 OrbitControls！
        const tCtrl = new TransformControls(dirCam, renderer.domElement);
        tCtrl.setSize(1.05);
        tCtrl.setSpace("world");
        scene.add(tCtrl.getHelper());
        transformRef.current = tCtrl;

        const controls = new OrbitControls(dirCam, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.target.set(0, 1.05, 0);
        controls.maxDistance = 60;
        controls.minDistance = 0.6;
        controlsRef.current = controls;

        tCtrl.addEventListener("dragging-changed", (ev) => {
            const dragging = Boolean(ev.value);
            controls.enabled = !dragging;
            if (dragging) {
                wasGizmoDraggingRef.current = true;
            } else {
                // 延迟一帧复位，防止紧随其后的 React onPointerUp 误判为空白点击而取消选中
                requestAnimationFrame(() => {
                    wasGizmoDraggingRef.current = false;
                });
            }
        });

        tCtrl.addEventListener("mouseUp", () => {
            const o = tCtrl.object;
            const live = liveRef.current;
            const sel = live.selected;
            if (!o || !sel) return;
            const mode = tCtrl.mode;
            if (mode === "translate") {
                live.onUpdateTransform(sel.kind, sel.id, {
                    position: [round2(o.position.x), round2(o.position.y), round2(o.position.z)],
                });
            } else if (mode === "rotate") {
                live.onUpdateTransform(sel.kind, sel.id, {
                    rotation: [radToDeg(o.rotation.x), radToDeg(o.rotation.y), radToDeg(o.rotation.z)],
                });
            } else if (mode === "scale") {
                if (sel.kind === "character") {
                    const ch = live.state.characters.find((c) => c.id === sel.id);
                    const preset = ch ? resolveCharacterPreset(ch.bodyType) : { scale: [1, 1, 1] as [number, number, number] };
                    live.onUpdateTransform("character", sel.id, {
                        scale: [
                            Math.max(0.1, round2(o.scale.x / preset.scale[0])),
                            Math.max(0.1, round2(o.scale.y / preset.scale[1])),
                            Math.max(0.1, round2(o.scale.z / preset.scale[2])),
                        ],
                    });
                } else {
                    live.onUpdateTransform(sel.kind, sel.id, {
                        scale: [
                            Math.max(0.05, round2(o.scale.x)),
                            Math.max(0.05, round2(o.scale.y)),
                            Math.max(0.05, round2(o.scale.z)),
                        ],
                    });
                }
            }
        });

        // 三点布光 + 环境半球光
        const ambient = new THREE.HemisphereLight(0xffffff, 0x22262e, 0.55);
        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far = 35;
        key.shadow.camera.left = -10;
        key.shadow.camera.right = 10;
        key.shadow.camera.top = 10;
        key.shadow.camera.bottom = -10;
        key.shadow.bias = -0.0006;

        const fill = new THREE.DirectionalLight(0xffffff, 1.1);
        fill.position.set(-7, 4.5, 5);
        const rim = new THREE.DirectionalLight(0xffffff, 0.7);
        rim.position.set(0, 5.5, -8);
        scene.add(ambient, key, fill, rim);
        lightsRef.current = { ambient, key, fill, rim };

        // 地面与网格
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(48, 48),
            new THREE.MeshStandardMaterial({ color: 0x242424, roughness: 0.92, metalness: 0.04, transparent: true, opacity: 0.5 }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.002;
        ground.receiveShadow = true;
        scene.add(ground);
        groundRef.current = ground;

        const grid = new THREE.GridHelper(32, 32, 0x37d39b, 0x2d323b);
        scene.add(grid);
        gridRef.current = grid;

        const dynamicGroup = new THREE.Group();
        const helperGroup = new THREE.Group();
        scene.add(dynamicGroup, helperGroup);
        dynamicGroupRef.current = dynamicGroup;
        helperGroupRef.current = helperGroup;

        const ro = new ResizeObserver(() => {
            if (!container || !rendererRef.current || !directorCamRef.current) return;
            const w = Math.max(120, container.clientWidth);
            const h = Math.max(120, container.clientHeight);
            rendererRef.current.setSize(w, h);
            directorCamRef.current.aspect = w / h;
            directorCamRef.current.updateProjectionMatrix();
        });
        ro.observe(container);

        let raf = 0;
        let frameCount = 0;
        const projVec = new THREE.Vector3();
        const qInv = new THREE.Quaternion();
        const xAxis = new THREE.Vector3();
        const yAxis = new THREE.Vector3();
        const zAxis = new THREE.Vector3();

        const loop = () => {
            raf = requestAnimationFrame(loop);
            controls.update();

            const live = liveRef.current;
            const w = Math.max(120, container.clientWidth);
            const h = Math.max(120, container.clientHeight);

            // 主视口使用的摄像机
            let renderCam: THREE.PerspectiveCamera = dirCam;
            const isMainCameraView = live.mainViewId !== "director";
            if (isMainCameraView) {
                const targetCam = live.evaluated.cameras.find((c) => c.id === live.mainViewId);
                if (targetCam) {
                    renderCam = makePerspectiveFromCamera(targetCam, w / h);
                }
            }

            // 机位视角时隐藏相机辅助物体与 Gizmo
            const tHelper = tCtrl.getHelper();
            const showGizmoInMain = !isMainCameraView && Boolean(tCtrl.object);
            helperGroup.visible = !isMainCameraView;
            tHelper.visible = showGizmoInMain;
            renderer.render(scene, renderCam);

            // 更新画中画（PiP）或分屏预览画布（每 2 帧刷新保持流畅高帧率）
            frameCount++;
            if (frameCount % 2 === 0 && (!live.pipCollapsed || live.splitPreview)) {
                const targetCanvas = live.splitPreview ? splitCanvasRef.current : pipCanvasRef.current;
                if (targetCanvas) {
                    const resolvedCamId =
                        live.pipCameraId === "storyboard"
                            ? live.evaluated.storyboardCameraId || live.evaluated.cameras[0]?.id
                            : live.pipCameraId;
                    const pipCamData = live.evaluated.cameras.find((c) => c.id === resolvedCamId) || live.evaluated.cameras[0];
                    if (pipCamData) {
                        const aspect = ratioNumber(pipCamData.aspectRatio || live.state.aspectRatio);
                        const cw = live.splitPreview ? 640 : 384;
                        const ch = Math.max(120, Math.round(cw / aspect));
                        if (targetCanvas.width !== cw || targetCanvas.height !== ch) {
                            targetCanvas.width = cw;
                            targetCanvas.height = ch;
                        }
                        const pipCam = makePerspectiveFromCamera(pipCamData, cw / ch);
                        const prevSize = new THREE.Vector2();
                        renderer.getSize(prevSize);

                        helperGroup.visible = false;
                        tHelper.visible = false;
                        renderer.setSize(cw, ch, false);
                        renderer.render(scene, pipCam);

                        const ctx2d = targetCanvas.getContext("2d");
                        if (ctx2d) {
                            ctx2d.clearRect(0, 0, cw, ch);
                            ctx2d.drawImage(renderer.domElement, 0, 0, cw, ch);
                            if (live.viewSettings.objectNames) {
                                drawBakedObjectLabels(ctx2d, cw, ch, pipCam, live.evaluated.characters, live.evaluated.props);
                            }
                        }

                        renderer.setSize(prevSize.x, prevSize.y, false);
                        helperGroup.visible = !isMainCameraView;
                        tHelper.visible = showGizmoInMain;
                        // 立即恢复主视口显示
                        renderer.render(scene, renderCam);
                    }
                }
            }

            // 每 4 帧更新视角轴指示球与 3D 浮动对象名称标签坐标
            if (frameCount % 4 === 0) {
                qInv.copy(renderCam.quaternion).invert();
                xAxis.set(1, 0, 0).applyQuaternion(qInv);
                yAxis.set(0, 1, 0).applyQuaternion(qInv);
                zAxis.set(0, 0, 1).applyQuaternion(qInv);
                setAxisDirs({
                    x: [xAxis.x, -xAxis.y],
                    y: [yAxis.x, -yAxis.y],
                    z: [zAxis.x, -zAxis.y],
                });

                if (live.viewSettings.objectNames) {
                    const labels: Array<{ id: string; text: string; heightText?: string; x: number; y: number; active: boolean }> = [];
                    live.evaluated.characters.forEach((ch) => {
                        if (ch.visible === false) return;
                        const p = resolveCharacterPreset(ch.bodyType);
                        const sc = toScale3(ch.scale);
                        const topY = ch.position[1] + p.heightM * sc[1] + 0.24;
                        projVec.set(ch.position[0], topY, ch.position[2]).project(renderCam);
                        if (projVec.z < 1) {
                            labels.push({
                                id: ch.id,
                                text: ch.name,
                                heightText: live.viewSettings.heightGuides ? `${(p.heightM * sc[1]).toFixed(2)}m` : undefined,
                                x: (projVec.x * 0.5 + 0.5) * w,
                                y: (-projVec.y * 0.5 + 0.5) * h,
                                active: live.selected?.kind === "character" && live.selected.id === ch.id,
                            });
                        }
                    });
                    live.evaluated.props.forEach((pr) => {
                        if (pr.visible === false) return;
                        const topY = pr.position[1] + pr.dimensions[1] * pr.scale[1] + 0.2;
                        projVec.set(pr.position[0], topY, pr.position[2]).project(renderCam);
                        if (projVec.z < 1) {
                            labels.push({
                                id: pr.id,
                                text: pr.name,
                                heightText: live.viewSettings.heightGuides ? `${(pr.dimensions[1] * pr.scale[1]).toFixed(2)}m` : undefined,
                                x: (projVec.x * 0.5 + 0.5) * w,
                                y: (-projVec.y * 0.5 + 0.5) * h,
                                active: live.selected?.kind === "prop" && live.selected.id === pr.id,
                            });
                        }
                    });
                    setProjectedLabels(labels);
                } else {
                    setProjectedLabels([]);
                }
            }
        };
        loop();

        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            tCtrl.dispose();
            controls.dispose();
            renderer.dispose();
            rendererRef.current = null;
            sceneRef.current = null;
            dynamicGroupRef.current = null;
            helperGroupRef.current = null;
            bgMeshRef.current = null;
        };
    }, [makePerspectiveFromCamera]);

    // 同步环境、三点布光、地面、网格与视图设置
    useEffect(() => {
        const scene = sceneRef.current;
        const renderer = rendererRef.current;
        const lights = lightsRef.current;
        const ground = groundRef.current;
        const grid = gridRef.current;
        if (!scene || !renderer || !lights || !ground || !grid) return;

        scene.background = new THREE.Color(env.backgroundColor || "#171717");
        renderer.toneMappingExposure = env.exposure || 1.05;

        // 主光球坐标 -> 笛卡尔坐标
        const az = deg(env.keyLight.azimuth);
        const el = deg(env.keyLight.elevation);
        const dist = 12;
        lights.key.color.set(env.keyLight.color || "#ffffff");
        lights.key.intensity = (env.keyLight.intensity ?? 3.4) * 0.65;
        lights.key.position.set(
            Math.cos(el) * Math.sin(az) * dist,
            Math.max(0.5, Math.sin(el) * dist),
            Math.cos(el) * Math.cos(az) * dist,
        );
        lights.key.castShadow = env.keyLight.castShadow !== false;

        lights.fill.color.set(env.fillLight.color || "#ffffff");
        lights.fill.intensity = (env.fillLight.intensity ?? 2.1) * 0.52;

        lights.rim.color.set(env.rimLight.color || "#ffffff");
        lights.rim.intensity = (env.rimLight.intensity ?? 1.1) * 0.55;

        const gMat = ground.material as THREE.MeshStandardMaterial;
        gMat.color.set(env.groundColor || "#242424");
        gMat.opacity = Math.max(0, Math.min(1, (env.groundOpacity ?? 50) / 100));
        ground.visible = env.showGround && viewSettings.ground;
        grid.visible = env.showGrid && viewSettings.grid;
    }, [env, viewSettings.ground, viewSettings.grid]);

    // 同步全景/平面背景图
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;
        if (bgMeshRef.current) {
            scene.remove(bgMeshRef.current);
            bgMeshRef.current.geometry.dispose();
            (bgMeshRef.current.material as THREE.Material).dispose();
            bgMeshRef.current = null;
        }
        if (!state.panoramaUrl || state.backgroundKind === "none") return;
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        loader.load(state.panoramaUrl, (tex) => {
            if (!sceneRef.current) {
                tex.dispose();
                return;
            }
            tex.colorSpace = THREE.SRGBColorSpace;
            const mesh =
                state.backgroundKind === "plane"
                    ? new THREE.Mesh(
                          new THREE.PlaneGeometry(18, 10.5),
                          new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
                      )
                    : new THREE.Mesh(
                          new THREE.SphereGeometry(56, 36, 24),
                          new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }),
                      );
            if (state.backgroundKind === "plane") {
                mesh.position.set(0, 5.2, -9.5);
            }
            sceneRef.current.add(mesh);
            bgMeshRef.current = mesh;
        });
    }, [state.panoramaUrl, state.backgroundKind]);

    // 同步角色、物体、机位、运动路径与高度参考线到 3D 场景
    useEffect(() => {
        const dyn = dynamicGroupRef.current;
        const helpers = helperGroupRef.current;
        if (!dyn || !helpers) return;

        // 先解绑旧对象的 TransformControls，避免移除节点时产生悬挂引用
        transformRef.current?.detach();
        while (dyn.children.length) dyn.remove(dyn.children[0]);
        while (helpers.children.length) helpers.remove(helpers.children[0]);
        const map = new Map<string, THREE.Object3D>();

        // 1. 角色
        evaluated.characters.forEach((ch) => {
            const tpl = ch.customAssetId ? customModelsRef.current.get(ch.customAssetId) : undefined;
            const mesh = buildDirectorMannequin(ch, {
                poseEditMode: poseEditMode && selected?.kind === "character" && selected.id === ch.id,
                activeJointGroup,
                customTemplate: tpl,
            });
            dyn.add(mesh);
            map.set(`character:${ch.id}`, mesh);

            // 高度参考线
            if (viewSettings.heightGuides && ch.visible !== false) {
                const preset = resolveCharacterPreset(ch.bodyType);
                const sc = toScale3(ch.scale);
                const topY = ch.position[1] + preset.heightM * sc[1];
                const geo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(ch.position[0] + 0.42, ch.position[1], ch.position[2]),
                    new THREE.Vector3(ch.position[0] + 0.42, topY, ch.position[2]),
                ]);
                helpers.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#37d39b", transparent: true, opacity: 0.48 })));
            }
        });

        // 2. 物体 / 几何体
        evaluated.props.forEach((pr) => {
            const tpl = pr.customAssetId ? customModelsRef.current.get(pr.customAssetId) : undefined;
            const mesh = buildDirectorProp(pr, tpl);
            dyn.add(mesh);
            map.set(`prop:${pr.id}`, mesh);

            if (viewSettings.heightGuides && pr.visible !== false) {
                const topY = pr.position[1] + pr.dimensions[1] * pr.scale[1];
                const gx = pr.position[0] + (pr.dimensions[0] * pr.scale[0]) / 2 + 0.16;
                const geo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(gx, pr.position[1], pr.position[2]),
                    new THREE.Vector3(gx, topY, pr.position[2]),
                ]);
                helpers.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#38bdf8", transparent: true, opacity: 0.42 })));
            }
        });

        // 3. 机位与注视点
        evaluated.cameras.forEach((cam) => {
            const active =
                (selected?.kind === "camera" || selected?.kind === "target") && selected.id === cam.id
                    ? true
                    : cam.id === state.activeCameraId;
            const { cameraGroup, targetGroup, sightLine } = buildCameraAndTargetGizmo(
                cam,
                active,
                cam.showTarget !== false,
            );
            helpers.add(cameraGroup, targetGroup, sightLine);
            map.set(`camera:${cam.id}`, cameraGroup);
            map.set(`target:${cam.id}`, targetGroup);
        });

        // 4. 运动路径（动态关键帧轨迹可视化）
        if (viewSettings.motionPaths && state.timeline?.keyframes?.length) {
            const grouped = new Map<string, [number, number, number][]>();
            state.timeline.keyframes
                .filter((k) => (k.property === "position" || k.property === "target") && Array.isArray(k.value))
                .sort((a, b) => a.time - b.time)
                .forEach((k) => {
                    const key = `${k.objectId}:${k.property}`;
                    const arr = grouped.get(key) || [];
                    arr.push(k.value as [number, number, number]);
                    grouped.set(key, arr);
                });
            grouped.forEach((pts, key) => {
                if (pts.length < 2) return;
                const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1] + 0.05, p[2])));
                const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(36));
                const isTarget = key.endsWith(":target");
                helpers.add(
                    new THREE.Line(
                        lineGeo,
                        new THREE.LineBasicMaterial({ color: isTarget ? "#fbbf24" : "#37d39b", transparent: true, opacity: 0.8 }),
                    ),
                );
                pts.forEach((p) => {
                    const dot = new THREE.Mesh(
                        new THREE.SphereGeometry(0.06, 10, 8),
                        new THREE.MeshBasicMaterial({ color: isTarget ? "#fbbf24" : "#37d39b" }),
                    );
                    dot.position.set(p[0], p[1] + 0.05, p[2]);
                    helpers.add(dot);
                });
            });
        }

        // 5. 正在绘制的 3D 路径点预览
        if (pathTask && pathTask.points.length > 0) {
            const pts = pathTask.points.map((p) => new THREE.Vector3(p[0], p[1] + 0.06, p[2]));
            pts.forEach((p) => {
                const marker = new THREE.Mesh(
                    new THREE.SphereGeometry(0.09, 12, 10),
                    new THREE.MeshBasicMaterial({ color: "#37d39b" }),
                );
                marker.position.copy(p);
                helpers.add(marker);
            });
            if (pts.length >= 2) {
                const geo = new THREE.BufferGeometry().setFromPoints(pts);
                helpers.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#37d39b" })));
            }
        }

        objectMapRef.current = map;
    }, [
        evaluated,
        selected,
        poseEditMode,
        activeJointGroup,
        viewSettings.heightGuides,
        viewSettings.motionPaths,
        state.activeCameraId,
        state.timeline?.keyframes,
        pathTask,
        modelTick,
    ]);

    // 将 TransformControls 挂载到当前选中对象
    useEffect(() => {
        const tCtrl = transformRef.current;
        if (!tCtrl) return;
        if (readOnly || tool === "select" || !selected || mainViewId !== "director" || placementTask || pathTask || cameraPickTask) {
            tCtrl.detach();
            return;
        }
        // 检查是否锁定
        const isLocked =
            selected.kind === "character"
                ? state.characters.find((c) => c.id === selected.id)?.locked
                : selected.kind === "prop"
                  ? (state.props || []).find((p) => p.id === selected.id)?.locked
                  : selected.kind === "camera"
                    ? state.cameras.find((c) => c.id === selected.id)?.locked
                    : state.cameras.find((c) => c.id === selected.id)?.lockTarget;
        if (isLocked) {
            tCtrl.detach();
            return;
        }

        const obj = objectMapRef.current.get(`${selected.kind}:${selected.id}`);
        if (!obj) {
            tCtrl.detach();
            return;
        }
        const effectiveMode = selected.kind === "camera" || selected.kind === "target" ? "translate" : tool;
        tCtrl.setMode(effectiveMode);
        tCtrl.attach(obj);
    }, [tool, selected, mainViewId, placementTask, pathTask, cameraPickTask, readOnly, evaluated, modelTick, poseEditMode, activeJointGroup, viewSettings.heightGuides, viewSettings.motionPaths, state.activeCameraId]);

    // 3D 画布点击：放置模式 / 路径绘制模式 / 机位目标选择 / 对象与关节点射线拾取
    const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
    const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        // 如果指针落在 TransformControls 轴手柄上，绝不记录为点选/取消选中操作
        if (transformRef.current?.axis || transformRef.current?.dragging) {
            pointerDownPosRef.current = null;
            return;
        }
        pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0 || !pointerDownPosRef.current) return;
        const moved = Math.hypot(e.clientX - pointerDownPosRef.current.x, e.clientY - pointerDownPosRef.current.y);
        pointerDownPosRef.current = null;
        if (moved > 5) return; // 拖动视角不触发点选
        if (transformRef.current?.dragging || wasGizmoDraggingRef.current) return;

        const container = mountRef.current;
        const dirCam = directorCamRef.current;
        const dyn = dynamicGroupRef.current;
        const helpers = helperGroupRef.current;
        if (!container || !dirCam || !dyn || !helpers) return;

        const rect = container.getBoundingClientRect();
        const ndc = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, dirCam);

        // 地面放置模式或路径绘制模式
        if (placementTask || pathTask) {
            const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const hit = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(groundPlane, hit)) {
                const pt: [number, number, number] = [round2(hit.x), 0, round2(hit.z)];
                if (placementTask) onPlaceAtPoint(pt);
                else if (pathTask) onAddPathPoint(pt);
            }
            return;
        }

        // 射线检测对象和关节点
        const targets = [...dyn.children, ...helpers.children];
        const hits = raycaster.intersectObjects(targets, true);
        const valid = hits.find((h) => h.object.userData?.directorKind);
        if (!valid) {
            if (!cameraPickTask) onSelect(null);
            return;
        }

        const { directorKind, directorId, jointGroup } = valid.object.userData as {
            directorKind: "character" | "prop" | "camera" | "target" | "joint";
            directorId: string;
            jointGroup?: string;
        };

        if (cameraPickTask) {
            if (directorKind === "character" || directorKind === "prop") {
                onPickCameraTarget(directorId);
            }
            return;
        }
        if (directorKind === "joint" && jointGroup) {
            onSelect({ kind: "character", id: directorId });
            onSelectJointGroup(jointGroup);
            return;
        }
        if (directorKind !== "joint") {
            onSelect({ kind: directorKind, id: directorId });
        }
    };

    // Alt + 滚轮调节导演视角 FOV
    const handleViewportWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (!e.altKey || !directorCamRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        const nextFov = Math.max(18, Math.min(100, Math.round(directorCamRef.current.fov + (e.deltaY > 0 ? 3 : -3))));
        directorCamRef.current.fov = nextFov;
        directorCamRef.current.updateProjectionMatrix();
        setDirectorFov(nextFov);
    };

    // 快捷键控制视角（按住 QWEASD 持续移动、IJKL 持续旋转、Shift 加速、-/= 调 FOV）
    const pressedKeysRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        const isInputTarget = (target: EventTarget | null) => {
            const tag = (target as HTMLElement | null)?.tagName;
            return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (target as HTMLElement | null)?.isContentEditable;
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (isInputTarget(e.target)) return;
            const key = e.key.toLowerCase();
            if (key === "-" || key === "_") {
                const cam = directorCamRef.current;
                if (!cam) return;
                const nextFov = Math.min(100, Math.round(cam.fov + 3));
                cam.fov = nextFov;
                cam.updateProjectionMatrix();
                setDirectorFov(nextFov);
                return;
            }
            if (key === "=" || key === "+") {
                const cam = directorCamRef.current;
                if (!cam) return;
                const nextFov = Math.max(18, Math.round(cam.fov - 3));
                cam.fov = nextFov;
                cam.updateProjectionMatrix();
                setDirectorFov(nextFov);
                return;
            }
            if (["q", "w", "e", "a", "s", "d", "i", "j", "k", "l", "shift"].includes(key)) {
                pressedKeysRef.current.add(key);
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            pressedKeysRef.current.delete(e.key.toLowerCase());
        };
        const clearKeys = () => pressedKeysRef.current.clear();

        let raf = 0;
        let last = performance.now();
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();
        const move = new THREE.Vector3();
        const offset = new THREE.Vector3();
        const sph = new THREE.Spherical();

        const tick = (now: number) => {
            raf = requestAnimationFrame(tick);
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            const keys = pressedKeysRef.current;
            if (!keys.size) return;
            const cam = directorCamRef.current;
            const ctrl = controlsRef.current;
            if (!cam || !ctrl) return;

            const boost = keys.has("shift") ? 2.6 : 1;
            const moveStep = 4.2 * boost * dt;
            const rotStep = 1.65 * boost * dt;

            cam.getWorldDirection(forward);
            right.crossVectors(forward, cam.up).normalize();
            move.set(0, 0, 0);

            if (keys.has("w")) move.addScaledVector(forward, moveStep);
            if (keys.has("s")) move.addScaledVector(forward, -moveStep);
            if (keys.has("a")) move.addScaledVector(right, -moveStep);
            if (keys.has("d")) move.addScaledVector(right, moveStep);
            if (keys.has("e")) move.y += moveStep;
            if (keys.has("q")) move.y -= moveStep;

            if (move.lengthSq() > 0) {
                cam.position.add(move);
                ctrl.target.add(move);
            }

            if (keys.has("i") || keys.has("j") || keys.has("k") || keys.has("l")) {
                offset.copy(cam.position).sub(ctrl.target);
                sph.setFromVector3(offset);
                if (keys.has("j")) sph.theta -= rotStep;
                if (keys.has("l")) sph.theta += rotStep;
                if (keys.has("i")) sph.phi = Math.max(0.12, sph.phi - rotStep);
                if (keys.has("k")) sph.phi = Math.min(Math.PI - 0.12, sph.phi + rotStep);
                offset.setFromSpherical(sph);
                cam.position.copy(ctrl.target).add(offset);
            }
            ctrl.update();
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", clearKeys);
        raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", clearKeys);
            clearKeys();
        };
    }, []);

    // 暴露给父组件的方法：聚焦、重置、拍照、导出视频
    const captureView = useCallback(
        (sourceId: "director" | string, aspectOverride?: string): DirectorSnapshot | null => {
            const renderer = rendererRef.current;
            const scene = sceneRef.current;
            const helpers = helperGroupRef.current;
            const tCtrl = transformRef.current;
            const dirCam = directorCamRef.current;
            if (!renderer || !scene || !helpers || !dirCam) return null;

            const ratioStr = aspectOverride || state.aspectRatio || "16:9";
            const ratio = ratioNumber(ratioStr);
            const w = ratio >= 1 ? 1280 : Math.round(1280 * ratio);
            const h = ratio >= 1 ? Math.round(1280 / ratio) : 1280;

            let shotCam: THREE.PerspectiveCamera;
            let cameraName = "导演视角";
            if (sourceId === "director") {
                shotCam = dirCam.clone();
                shotCam.aspect = w / h;
                shotCam.updateProjectionMatrix();
            } else {
                const cam = evaluated.cameras.find((c) => c.id === sourceId) || evaluated.cameras[0];
                if (!cam) return null;
                shotCam = makePerspectiveFromCamera(cam, w / h);
                cameraName = cam.name;
            }

            const prevSize = new THREE.Vector2();
            renderer.getSize(prevSize);
            const prevHelper = helpers.visible;
            const tHelper = tCtrl?.getHelper();
            const prevT = tHelper ? tHelper.visible : false;

            helpers.visible = false;
            if (tHelper) tHelper.visible = false;
            renderer.setSize(w, h, false);
            renderer.render(scene, shotCam);

            // 将三维渲染帧合成到 2D 画布，并把人物/物体头顶名称清晰印到拍摄结果中
            const outCanvas = document.createElement("canvas");
            outCanvas.width = w;
            outCanvas.height = h;
            const outCtx = outCanvas.getContext("2d");
            let dataUrl: string;
            if (outCtx) {
                outCtx.drawImage(renderer.domElement, 0, 0, w, h);
                if (liveRef.current.viewSettings.objectNames) {
                    drawBakedObjectLabels(outCtx, w, h, shotCam, evaluated.characters, evaluated.props);
                }
                dataUrl = outCanvas.toDataURL("image/png");
            } else {
                dataUrl = renderer.domElement.toDataURL("image/png");
            }

            helpers.visible = prevHelper;
            if (tHelper) tHelper.visible = prevT;
            renderer.setSize(prevSize.x, prevSize.y, false);

            const idx = String(state.snapshots.length + 1).padStart(2, "0");
            return {
                id: nanoid(),
                title: `Capture_${idx}`,
                cameraName,
                aspectRatio: ratioStr,
                dataUrl,
                createdAt: Date.now(),
            };
        },
        [evaluated.cameras, evaluated.characters, evaluated.props, makePerspectiveFromCamera, state.aspectRatio, state.snapshots.length],
    );

    const exportVideoBlob = useCallback(
        async (opts: {
            source: "storyboard" | string;
            simplifiedCharacters: boolean;
            longEdge: 1280 | 1920;
            fps: number;
            onProgress?: (pct: number) => void;
        }): Promise<Blob> => {
            const tl = state.timeline;
            const duration = Math.max(1, Math.min(20, tl?.duration || 6));
            const ratio = ratioNumber(state.aspectRatio || "16:9");
            const w = ratio >= 1 ? opts.longEdge : Math.round(opts.longEdge * ratio);
            const h = ratio >= 1 ? Math.round(opts.longEdge / ratio) : opts.longEdge;
            // 保证偶数像素尺寸以兼容编码器
            const outW = w - (w % 2);
            const outH = h - (h % 2);

            const offCanvas = document.createElement("canvas");
            offCanvas.width = outW;
            offCanvas.height = outH;
            const offRenderer = new THREE.WebGLRenderer({ canvas: offCanvas, antialias: true, preserveDrawingBuffer: true });
            offRenderer.setSize(outW, outH, false);
            offRenderer.shadowMap.enabled = true;
            offRenderer.toneMapping = THREE.ACESFilmicToneMapping;
            offRenderer.toneMappingExposure = env.exposure || 1.05;

            const offScene = new THREE.Scene();
            offScene.background = new THREE.Color(env.backgroundColor || "#171717");
            const amb = new THREE.HemisphereLight(0xffffff, 0x22262e, 0.55);
            const key = new THREE.DirectionalLight(env.keyLight.color || "#ffffff", (env.keyLight.intensity ?? 3.4) * 0.65);
            const az = deg(env.keyLight.azimuth);
            const el = deg(env.keyLight.elevation);
            key.position.set(Math.cos(el) * Math.sin(az) * 12, Math.max(0.5, Math.sin(el) * 12), Math.cos(el) * Math.cos(az) * 12);
            key.castShadow = env.keyLight.castShadow !== false;
            const fill = new THREE.DirectionalLight(env.fillLight.color || "#ffffff", (env.fillLight.intensity ?? 2.1) * 0.52);
            fill.position.set(-7, 4.5, 5);
            const rim = new THREE.DirectionalLight(env.rimLight.color || "#ffffff", (env.rimLight.intensity ?? 1.1) * 0.55);
            rim.position.set(0, 5.5, -8);
            offScene.add(amb, key, fill, rim);

            if (env.showGround) {
                const g = new THREE.Mesh(
                    new THREE.PlaneGeometry(48, 48),
                    new THREE.MeshStandardMaterial({
                        color: env.groundColor || "#242424",
                        roughness: 0.92,
                        transparent: true,
                        opacity: (env.groundOpacity ?? 50) / 100,
                    }),
                );
                g.rotation.x = -Math.PI / 2;
                g.position.y = -0.002;
                g.receiveShadow = true;
                offScene.add(g);
            }

            const dyn = new THREE.Group();
            offScene.add(dyn);

            const stream = offCanvas.captureStream(opts.fps);
            const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
                ? "video/webm;codecs=vp9"
                : "video/webm";
            const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
            const chunks: BlobPart[] = [];
            recorder.ondataavailable = (ev) => {
                if (ev.data.size > 0) chunks.push(ev.data);
            };
            const finished = new Promise<Blob>((resolve) => {
                recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
            });

            recorder.start();
            const totalFrames = Math.max(12, Math.round(duration * opts.fps));
            const frameDelayMs = Math.max(8, Math.round(1000 / opts.fps));

            for (let f = 0; f <= totalFrames; f++) {
                const t = (f / totalFrames) * duration;
                const snapState = evaluateSceneAtTime({ ...state, mode: "dynamic" }, t, state.customActions || []);
                while (dyn.children.length) dyn.remove(dyn.children[0]);

                snapState.characters.forEach((ch) => {
                    const tpl = ch.customAssetId ? customModelsRef.current.get(ch.customAssetId) : undefined;
                    dyn.add(buildDirectorMannequin(ch, { simplified: opts.simplifiedCharacters, customTemplate: tpl }));
                });
                snapState.props.forEach((pr) => {
                    const tpl = pr.customAssetId ? customModelsRef.current.get(pr.customAssetId) : undefined;
                    dyn.add(buildDirectorProp(pr, tpl));
                });

                const camId =
                    opts.source === "storyboard"
                        ? snapState.storyboardCameraId || snapState.cameras[0]?.id
                        : opts.source;
                const camData = snapState.cameras.find((c) => c.id === camId) || snapState.cameras[0];
                const renderCam = camData
                    ? makePerspectiveFromCamera(camData, outW / outH)
                    : new THREE.PerspectiveCamera(50, outW / outH, 0.1, 120);

                offRenderer.render(offScene, renderCam);
                opts.onProgress?.(Math.min(99, Math.round((f / totalFrames) * 100)));
                await new Promise((r) => setTimeout(r, frameDelayMs));
            }

            recorder.stop();
            const blob = await finished;
            offRenderer.dispose();
            opts.onProgress?.(100);
            return blob;
        },
        [env, makePerspectiveFromCamera, state],
    );

    useImperativeHandle(
        ref,
        () => ({
            focusObject: (pos) => {
                if (!directorCamRef.current || !controlsRef.current) return;
                controlsRef.current.target.set(pos[0], pos[1] + 0.9, pos[2]);
                directorCamRef.current.position.set(pos[0] + 3.2, pos[1] + 2.2, pos[2] + 3.8);
                controlsRef.current.update();
            },
            resetView: () => {
                if (!directorCamRef.current || !controlsRef.current) return;
                directorCamRef.current.position.set(5.4, 3.6, 6.8);
                directorCamRef.current.fov = 50;
                directorCamRef.current.updateProjectionMatrix();
                setDirectorFov(50);
                controlsRef.current.target.set(0, 1.05, 0);
                controlsRef.current.update();
            },
            getDirectorCameraPose: () => {
                const cam = directorCamRef.current;
                const ctrl = controlsRef.current;
                if (!cam || !ctrl) return { position: [0, 2.2, 7], target: [0, 1, 0], fov: 50 };
                return {
                    position: [round2(cam.position.x), round2(cam.position.y), round2(cam.position.z)],
                    target: [round2(ctrl.target.x), round2(ctrl.target.y), round2(ctrl.target.z)],
                    fov: Math.round(cam.fov),
                };
            },
            captureView,
            exportVideoBlob,
        }),
        [captureView, exportVideoBlob],
    );

    // 快捷点击坐标轴切换正/侧/顶视图
    const snapAxisView = (axis: "x" | "y" | "z") => {
        const cam = directorCamRef.current;
        const ctrl = controlsRef.current;
        if (!cam || !ctrl) return;
        const t = ctrl.target.clone();
        const d = Math.max(4, cam.position.distanceTo(t));
        if (axis === "x") cam.position.set(t.x + d, t.y, t.z);
        if (axis === "y") cam.position.set(t.x, t.y + d, t.z + 0.01);
        if (axis === "z") cam.position.set(t.x, t.y, t.z + d);
        ctrl.update();
    };

    // PiP 拖拽移动与左下角拖拽缩放
    const startPipDrag = (e: React.PointerEvent) => {
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const orig = { ...pipPos };
        const onMove = (ev: PointerEvent) => {
            setPipPos({
                x: Math.max(12, orig.x + (ev.clientX - startX)),
                y: Math.max(12, orig.y + (ev.clientY - startY)),
            });
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    const startPipResize = (e: React.PointerEvent) => {
        e.stopPropagation();
        const startX = e.clientX;
        const origW = pipWidth;
        const onMove = (ev: PointerEvent) => {
            setPipWidth(Math.max(180, Math.min(460, origW + (ev.clientX - startX))));
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    const activePipId = state.pipCameraId || state.activeCameraId || state.cameras[0]?.id || "storyboard";
    const activePipLabel =
        activePipId === "storyboard"
            ? "分镜编排"
            : state.cameras.find((c) => c.id === activePipId)?.name || state.cameras[0]?.name || "机位";
    const activeMainLabel =
        mainViewId === "director"
            ? "导演视角"
            : state.cameras.find((c) => c.id === mainViewId)?.name || "导演视角";
    const currentAspect = ratioNumber(state.aspectRatio);

    return (
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[#101318]">
            {/* 主 3D WebGL 视口区域 */}
            <div
                className="relative min-h-0 min-w-0 flex-1"
                style={splitPreview ? { width: `${Math.round(splitRatio * 100)}%`, flex: "none" } : undefined}
                onWheel={handleViewportWheel}
            >
                <div
                    ref={mountRef}
                    className={`h-full w-full ${placementTask || pathTask ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
                    onPointerDown={handleCanvasPointerDown}
                    onPointerUp={handleCanvasPointerUp}
                />

                {/* 3D 浮动对象名称与高度参考标牌（取景器模式也同步显示） */}
                {viewSettings.objectNames && (
                    <div className="pointer-events-none absolute inset-0 overflow-hidden">
                        {projectedLabels.map((lbl) => (
                            <div
                                key={lbl.id}
                                className="absolute -translate-x-1/2 -translate-y-full rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap backdrop-blur-md transition-opacity"
                                style={{
                                    left: lbl.x,
                                    top: lbl.y,
                                    background: lbl.active ? "rgba(14,169,119,0.28)" : "rgba(15,18,24,0.68)",
                                    borderColor: lbl.active ? "#37d39b" : "rgba(255,255,255,0.16)",
                                    color: "#f4f6f9",
                                }}
                            >
                                {lbl.text}
                                {lbl.heightText && <span className="ml-1.5 font-mono text-[#37d39b]">{lbl.heightText}</span>}
                            </div>
                        ))}
                    </div>
                )}

                {/* 机位画幅遮罩（机位主视角或取景器模式） */}
                {(viewfinderOpen || (mainViewId !== "director" && viewSettings.cameraFrameMask)) && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
                        <div
                            className="relative max-h-full max-w-full rounded-lg border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.48)]"
                            style={{
                                borderColor: viewfinderOpen ? "#37d39b" : "rgba(55,211,155,0.62)",
                                aspectRatio: String(currentAspect),
                                width: currentAspect >= 1 ? "86%" : "auto",
                                height: currentAspect < 1 ? "88%" : "auto",
                            }}
                        >
                            {/* 中心十字与三分参考微线 */}
                            <div className="absolute inset-x-0 top-1/2 h-px bg-white/15" />
                            <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
                        </div>
                    </div>
                )}

                {/* 顶部交互引导横幅（放置模式 / 路径绘制 / 机位选目标） */}
                {(placementTask || pathTask || cameraPickTask) && (
                    <div
                        className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-full border px-4 py-1.5 text-xs shadow-xl"
                        style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, borderColor: theme.accent.base }}
                    >
                        <span className="size-2 animate-pulse rounded-full bg-[#37d39b]" />
                        {placementTask && (
                            <>
                                <span className="font-medium">
                                    放置 <strong>{placementTask.label}</strong> — 点击 3D 地面放置对象
                                </span>
                                <button
                                    type="button"
                                    className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] hover:bg-white/20"
                                    onClick={onCancelPlacement}
                                >
                                    取消 (Esc)
                                </button>
                            </>
                        )}
                        {pathTask && (
                            <>
                                <span className="font-medium">
                                    {pathTask.label}（已点 {pathTask.points.length} 个路径点，点击地面继续添加）
                                </span>
                                <button
                                    type="button"
                                    disabled={pathTask.points.length < 2}
                                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white disabled:opacity-40"
                                    style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                                    onClick={onConfirmPath}
                                >
                                    确认路径
                                </button>
                                <button
                                    type="button"
                                    className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] hover:bg-white/20"
                                    onClick={onCancelPath}
                                >
                                    取消
                                </button>
                            </>
                        )}
                        {cameraPickTask && (
                            <>
                                <span className="font-medium">
                                    {cameraPickTask.presetName}：
                                    {cameraPickTask.dual
                                        ? `选择前景角色和注视点（已选 ${cameraPickTask.pickedIds.length}/2）`
                                        : `点击要拍摄的角色或物体（已选 ${cameraPickTask.pickedIds.length}/1）`}
                                </span>
                                <button
                                    type="button"
                                    disabled={cameraPickTask.pickedIds.length < (cameraPickTask.dual ? 2 : 1)}
                                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white disabled:opacity-40"
                                    style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                                    onClick={onConfirmCameraPick}
                                >
                                    确认
                                </button>
                                <button
                                    type="button"
                                    className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] hover:bg-white/20"
                                    onClick={onCancelCameraPick}
                                >
                                    取消
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* 取景器模式顶部浮动快门控制条（统一居中对齐胶囊） */}
                {viewfinderOpen && (
                    <div
                        className="absolute top-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-2xl border px-2.5 py-1.5 text-xs shadow-2xl"
                        style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, borderColor: theme.accent.base }}
                    >
                        <div
                            className="relative inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium leading-none transition hover:border-[#37d39b]"
                            style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.text }}
                        >
                            <span className="max-w-[120px] truncate">{activeMainLabel}</span>
                            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                            <select
                                aria-label="取景视角"
                                value={mainViewId}
                                onChange={(e) => onMainViewChange(e.target.value)}
                                className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
                            >
                                <option value="director" style={{ background: theme.node.panel, color: theme.node.text }}>导演视角</option>
                                {state.cameras.map((c) => (
                                    <option key={c.id} value={c.id} style={{ background: theme.node.panel, color: theme.node.text }}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div
                            className="relative inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-xl border px-2.5 font-mono text-xs font-semibold leading-none transition hover:border-[#37d39b]"
                            style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.text }}
                        >
                            <span>{state.aspectRatio}</span>
                            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                            <select
                                aria-label="拍摄画幅比例"
                                value={state.aspectRatio}
                                onChange={(e) => onChangeAspectRatio(e.target.value)}
                                className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
                            >
                                {DIRECTOR_ASPECT_RATIOS.map((r) => (
                                    <option key={r.value} value={r.value} style={{ background: theme.node.panel, color: theme.node.text }}>
                                        {r.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <span
                            className="inline-flex h-8 shrink-0 items-center justify-center rounded-xl px-2.5 font-mono text-[11px] leading-none"
                            style={{ background: theme.glass.inset, color: theme.node.muted }}
                        >
                            FOV {mainViewId === "director" ? directorFov : state.cameras.find((c) => c.id === mainViewId)?.fov || 50}°
                        </span>

                        <button
                            type="button"
                            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold leading-none text-white shadow-sm transition hover:brightness-110"
                            style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                            onClick={() => {
                                const snap = captureView(mainViewId, state.aspectRatio);
                                if (snap) onTakeSnapshot(snap);
                            }}
                        >
                            <Camera className="size-3.5" />
                            <span>拍摄</span>
                        </button>

                        <button
                            type="button"
                            className="inline-flex h-8 shrink-0 items-center justify-center rounded-xl border px-3 text-xs font-medium leading-none transition hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                            onClick={onCloseViewfinder}
                        >
                            退出预览
                        </button>
                    </div>
                )}

                {/* 左上角画中画（PiP）实时预览窗（分屏模式和取景器模式下隐藏） */}
                {!splitPreview && !viewfinderOpen && (
                    <div
                        className="absolute z-10 overflow-hidden rounded-2xl border shadow-2xl"
                        style={{
                            left: pipPos.x,
                            top: pipPos.y,
                            width: pipCollapsed ? 196 : pipWidth,
                            ...canvasGlass(theme),
                            backgroundColor: "rgba(16,19,24,0.86)",
                            borderColor: theme.glass.border,
                        }}
                    >
                        <div className="flex items-center gap-1.5 border-b px-2 py-1.5 text-[11px]" style={{ borderColor: theme.glass.insetBorder }}>
                            <button
                                type="button"
                                title="拖拽移动预览窗"
                                className="cursor-move opacity-60 hover:opacity-100"
                                onPointerDown={startPipDrag}
                            >
                                <GripVertical className="size-3.5" />
                            </button>
                            <div className="relative min-w-0 flex-1">
                                <button
                                    type="button"
                                    className="inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-0.5 font-medium text-white/90 hover:bg-white/10"
                                    onClick={() => setPipDropdownOpen((v) => !v)}
                                >
                                    <span className="truncate">{activePipLabel}</span>
                                    <ChevronDown className="size-3 shrink-0 opacity-70" />
                                </button>
                                {pipDropdownOpen && (
                                    <div
                                        className="absolute top-full left-0 z-30 mt-1 w-40 rounded-xl border p-1 shadow-2xl"
                                        style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-[#0ea977]/15"
                                            style={activePipId === "storyboard" ? { color: theme.accent.base, fontWeight: 600 } : undefined}
                                            onClick={() => {
                                                onChangePipCamera("storyboard");
                                                setPipDropdownOpen(false);
                                            }}
                                        >
                                            <span>分镜编排</span>
                                            <span className="text-[10px] opacity-60">实时</span>
                                        </button>
                                        {state.cameras.map((cam) => (
                                            <button
                                                key={cam.id}
                                                type="button"
                                                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-[#0ea977]/15"
                                                style={activePipId === cam.id ? { color: theme.accent.base, fontWeight: 600 } : undefined}
                                                onClick={() => {
                                                    onChangePipCamera(cam.id);
                                                    setPipDropdownOpen(false);
                                                }}
                                            >
                                                <span className="truncate">{cam.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                title="分屏预览"
                                className="grid size-6 place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-[#37d39b]"
                                onClick={() => setSplitPreview(true)}
                            >
                                <Columns2 className="size-3.5" />
                            </button>
                            <button
                                type="button"
                                title={pipCollapsed ? "展开机位预览" : "收起机位预览"}
                                className="grid size-6 place-items-center rounded-lg text-white/75 hover:bg-white/10"
                                onClick={() => setPipCollapsed((v) => !v)}
                            >
                                {pipCollapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
                            </button>
                        </div>
                        {!pipCollapsed && (
                            <div className="relative bg-[#0c0f14]">
                                <canvas ref={pipCanvasRef} className="block w-full object-contain" />
                                <button
                                    type="button"
                                    title="拖动调整预览大小"
                                    onPointerDown={startPipResize}
                                    className="absolute right-1 bottom-1 grid size-5 cursor-ew-resize place-items-center rounded bg-black/45 text-white/70 hover:text-[#37d39b]"
                                >
                                    <Maximize2 className="size-2.5" />
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* 左下角视角切换器（导演视角 / 各机位） */}
                {!viewfinderOpen && (
                    <div className="absolute bottom-4 left-4 z-10">
                        <button
                            type="button"
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium shadow-lg transition hover:border-[#37d39b]"
                            style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                            onClick={() => setViewDropdownOpen((v) => !v)}
                        >
                            <Compass className="size-3.5" style={{ color: theme.accent.base }} />
                            <span>{activeMainLabel}</span>
                            <ChevronDown className="size-3.5 opacity-60" />
                        </button>
                        {viewDropdownOpen && (
                            <div
                                className="absolute bottom-full left-0 mb-1.5 w-44 rounded-xl border p-1 shadow-2xl"
                                style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                            >
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-[#0ea977]/15"
                                    style={mainViewId === "director" ? { color: theme.accent.base, fontWeight: 600 } : undefined}
                                    onClick={() => {
                                        onMainViewChange("director");
                                        setViewDropdownOpen(false);
                                    }}
                                >
                                    导演视角（自由轨道）
                                </button>
                                <div className="my-1 border-t" style={{ borderColor: theme.glass.insetBorder }} />
                                {state.cameras.map((cam) => (
                                    <button
                                        key={cam.id}
                                        type="button"
                                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-[#0ea977]/15"
                                        style={mainViewId === cam.id ? { color: theme.accent.base, fontWeight: 600 } : undefined}
                                        onClick={() => {
                                            onMainViewChange(cam.id);
                                            setViewDropdownOpen(false);
                                        }}
                                    >
                                        <span className="truncate">{cam.name}</span>
                                        <span className="font-mono text-[10px] opacity-60">{cam.fov}°</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 底部居中「导演 Agent」快捷搭建栏 */}
                {!viewfinderOpen && !readOnly && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex flex-col items-center gap-1.5 px-36">
                        {agentFeedback && (
                            <div
                                className="pointer-events-auto max-w-md truncate rounded-full border px-3 py-1 text-[11px] shadow-lg"
                                style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.accent.base, borderColor: theme.accent.base }}
                            >
                                <Sparkles className="mr-1 inline size-3" />
                                {agentFeedback}
                            </div>
                        )}
                        <form
                            className="pointer-events-auto flex w-full max-w-[460px] items-center gap-1.5 rounded-2xl border px-2 py-1.5 shadow-2xl"
                            style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (!agentInput.trim()) return;
                                onAgentSubmit(agentInput);
                                setAgentInput("");
                            }}
                        >
                            <button
                                type="button"
                                title="上传参考背景图"
                                className="grid size-7 shrink-0 place-items-center rounded-xl transition hover:bg-[#0ea977]/15"
                                style={{ color: theme.node.muted }}
                                onClick={() => uploadRef.current?.click()}
                            >
                                <Upload className="size-3.5" />
                            </button>
                            <input
                                ref={uploadRef}
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    e.target.value = "";
                                    if (f) onUploadBackgroundQuick(f);
                                }}
                            />
                            <input
                                value={agentInput}
                                onChange={(e) => setAgentInput(e.target.value)}
                                placeholder="描述场景、角色走位和运镜，Agent 帮你搭建"
                                className="h-7 min-w-0 flex-1 bg-transparent px-1 text-xs outline-none placeholder:opacity-55"
                                style={{ color: theme.node.text }}
                            />
                            <button
                                type="submit"
                                title="发送并自动搭景"
                                disabled={!agentInput.trim()}
                                className="grid size-7 shrink-0 place-items-center rounded-xl text-white transition disabled:opacity-35"
                                style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                            >
                                ↑
                            </button>
                        </form>
                    </div>
                )}

                {/* 右下角交互式 XYZ 视角指示器 + FOV + 重置视角 */}
                {viewSettings.viewIndicator && !viewfinderOpen && (
                    <div className="absolute right-4 bottom-4 z-10 flex flex-col items-center gap-1.5">
                        <div
                            className="flex flex-col items-center rounded-2xl border p-2 shadow-xl"
                            style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel }}
                        >
                            <svg width="56" height="56" viewBox="-32 -32 64 64" className="overflow-visible">
                                <line x1="0" y1="0" x2={axisDirs.x[0] * 21} y2={axisDirs.x[1] * 21} stroke="#f43f5e" strokeWidth="2" />
                                <line x1="0" y1="0" x2={axisDirs.y[0] * 21} y2={axisDirs.y[1] * 21} stroke="#37d39b" strokeWidth="2" />
                                <line x1="0" y1="0" x2={axisDirs.z[0] * 21} y2={axisDirs.z[1] * 21} stroke="#38bdf8" strokeWidth="2" />
                                {(
                                    [
                                        ["x", axisDirs.x, "#f43f5e", "X"],
                                        ["y", axisDirs.y, "#37d39b", "Y"],
                                        ["z", axisDirs.z, "#38bdf8", "Z"],
                                    ] as const
                                ).map(([ax, pt, col, txt]) => (
                                    <g
                                        key={ax}
                                        className="cursor-pointer"
                                        transform={`translate(${pt[0] * 22}, ${pt[1] * 22})`}
                                        onClick={() => snapAxisView(ax)}
                                    >
                                        <circle r="7.5" fill={col} />
                                        <text textAnchor="middle" dominantBaseline="central" fontSize="8" fontWeight="700" fill="#0b0e14">
                                            {txt}
                                        </text>
                                    </g>
                                ))}
                            </svg>
                            <span className="mt-0.5 font-mono text-[10px]" style={{ color: theme.node.muted }}>
                                FOV {directorFov}°
                            </span>
                        </div>
                        <button
                            type="button"
                            className="inline-flex h-7 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-medium shadow-lg transition hover:border-[#37d39b]"
                            style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                            onClick={() => {
                                if (!directorCamRef.current || !controlsRef.current) return;
                                directorCamRef.current.position.set(5.4, 3.6, 6.8);
                                directorCamRef.current.fov = 50;
                                directorCamRef.current.updateProjectionMatrix();
                                setDirectorFov(50);
                                controlsRef.current.target.set(0, 1.05, 0);
                                controlsRef.current.update();
                            }}
                        >
                            <RotateCcw className="size-3" />
                            重置视角
                        </button>
                    </div>
                )}
            </div>

            {/* 分屏实时机位预览区（含可拖拽分割线） */}
            {splitPreview && !viewfinderOpen && (
                <>
                    <div
                        className="w-1.5 shrink-0 cursor-col-resize bg-white/10 transition hover:bg-[#37d39b]"
                        onPointerDown={(e) => {
                            const parent = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                            const onMove = (ev: PointerEvent) => {
                                const r = (ev.clientX - parent.left) / Math.max(200, parent.width);
                                setSplitRatio(Math.max(0.28, Math.min(0.75, r)));
                            };
                            const onUp = () => {
                                window.removeEventListener("pointermove", onMove);
                                window.removeEventListener("pointerup", onUp);
                            };
                            window.addEventListener("pointermove", onMove);
                            window.addEventListener("pointerup", onUp);
                        }}
                    />
                    <div className="relative flex min-w-0 flex-1 flex-col bg-[#0a0d12]">
                        <div
                            className="flex items-center justify-between border-b px-3 py-2 text-xs"
                            style={{ borderColor: theme.glass.insetBorder, color: theme.node.text }}
                        >
                            <div className="flex items-center gap-2">
                                <span className="size-2 rounded-full bg-[#37d39b]" />
                                <span className="font-semibold">分屏实时预览 · {activePipLabel}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    value={activePipId}
                                    onChange={(e) => onChangePipCamera(e.target.value)}
                                    className="h-7 rounded-lg border px-2 text-xs outline-none"
                                    style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.text }}
                                >
                                    <option value="storyboard">分镜编排</option>
                                    {state.cameras.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="grid size-7 place-items-center rounded-lg hover:bg-white/10"
                                    onClick={() => setSplitPreview(false)}
                                >
                                    <X className="size-4" />
                                </button>
                            </div>
                        </div>
                        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
                            <canvas
                                ref={splitCanvasRef}
                                className="max-h-full max-w-full rounded-xl border border-white/10 shadow-2xl"
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
});
