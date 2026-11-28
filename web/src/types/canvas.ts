import type { CharacterRecipe } from "@/services/api/pose-gallery";

export const CHARACTER_RECIPE_NODE_TYPE = "character-recipe";
export const DIRECTOR_NODE_TYPE = "blinkflow:director";

export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Config = "config",
    Video = "video",
    Audio = "audio",
    Group = "group",
}

// Node types are open strings: built-ins use CanvasNodeType and plugins use "<pluginId>:<name>".
export type CanvasNodeTypeId = CanvasNodeType | (string & {});

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio";
export type CanvasImageGenerationType = "generation" | "edit";

export type CanvasNodeImage = {
    id: string;
    status: CanvasNodeStatus;
    errorDetails?: string;
    content: string;
    storageKey?: string;
    naturalWidth: number;
    naturalHeight: number;
    bytes: number;
    mimeType: string;
};

export type CanvasNodeText = {
    id: string;
    status: CanvasNodeStatus;
    errorDetails?: string;
    content: string;
};

export type CanvasCropRect = { x: number; y: number; width: number; height: number };
export type CanvasCropContext = { full: true } | { conflict: true } | {
    version: 1;
    sourceNodeId: string;
    sourceIdentity: string;
    sourceStorageKey?: string;
    sourceWidth: number;
    sourceHeight: number;
    rect: CanvasCropRect;
    paddedRect: CanvasCropRect;
};

export type PoseJoints25 = {
    bodyPitch?: number;
    bodyYaw?: number;
    bodyRoll?: number;
    chestPitch?: number;
    chestYaw?: number;
    chestRoll?: number;
    headPitch?: number;
    headYaw?: number;
    headRoll?: number;
    leftArmPitch?: number;
    leftArmAbduct?: number;
    leftArmTwist?: number;
    leftArmBend?: number;
    rightArmPitch?: number;
    rightArmAbduct?: number;
    rightArmTwist?: number;
    rightArmBend?: number;
    leftLegPitch?: number;
    leftLegAbduct?: number;
    leftLegTwist?: number;
    leftLegBend?: number;
    rightLegPitch?: number;
    rightLegAbduct?: number;
    rightLegTwist?: number;
    rightLegBend?: number;
    // Legacy compatibility keys
    torsoPitch?: number;
    leftArm?: number;
    rightArm?: number;
    leftElbow?: number;
    rightElbow?: number;
    leftLeg?: number;
    rightLeg?: number;
};

export type DirectorCharacterBodyType =
    | "male_standard"
    | "female_standard"
    | "male_teen"
    | "female_teen"
    | "male_child"
    | "female_child"
    | "male_slim"
    | "female_slim"
    | "male_muscular"
    | "female_muscular"
    | "male_plump"
    | "female_plump"
    | "custom"
    // Legacy body types kept for seamless backward compatibility
    | "male"
    | "female"
    | "muscular"
    | "slim"
    | "teen"
    | "child"
    | "crowd"
    | "prop";

export type DirectorCharacterItem = {
    id: string;
    name: string;
    bodyType: DirectorCharacterBodyType;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number | [number, number, number];
    color: string;
    defaultColor?: string;
    opacity?: number;
    visible?: boolean;
    locked?: boolean;
    pose: string;
    poseActionId?: string;
    poseFrame?: number;
    joints?: PoseJoints25;
    autoFacePath?: boolean;
    customAssetId?: string;
};

export type DirectorPropItem = {
    id: string;
    name: string;
    presetId: string;
    category: string;
    baseHeight: number;
    dimensions: [number, number, number];
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    color: string;
    defaultColor?: string;
    opacity: number;
    visible?: boolean;
    locked?: boolean;
    customAssetId?: string;
};

export type DirectorCameraItem = {
    id: string;
    name: string;
    position: [number, number, number];
    target: [number, number, number];
    followCharacterId?: string;
    fov: number;
    roll?: number;
    aspectRatio?: string;
    showTarget?: boolean;
    lockTarget?: boolean;
    locked?: boolean;
};

export type DirectorEnvironment = {
    preset: "studio" | "daylight" | "sunset" | "night";
    backgroundColor: string;
    groundColor: string;
    showGround: boolean;
    groundOpacity: number;
    exposure: number;
    showGrid: boolean;
    keyLight: { color: string; intensity: number; azimuth: number; elevation: number; castShadow: boolean };
    fillLight: { color: string; intensity: number };
    rimLight: { color: string; intensity: number };
};

export type DirectorViewSettings = {
    ground: boolean;
    grid: boolean;
    motionPaths: boolean;
    objectNames: boolean;
    heightGuides: boolean;
    cameraFrameMask: boolean;
    viewIndicator: boolean;
};

export type DirectorBackgroundItem = {
    id: string;
    name: string;
    kind: "panorama" | "plane";
    url: string;
    storageKey?: string;
    createdAt: number;
};

export type DirectorCustomAsset = {
    id: string;
    name: string;
    kind: "character" | "prop";
    format: "glb" | "gltf" | "fbx";
    targetHeight: number;
    url?: string;
    storageKey?: string;
    createdAt: number;
};

export type DirectorCustomAction = {
    id: string;
    name: string;
    source: "text" | "video" | "fbx";
    description?: string;
    durationSec: number;
    keyframes: Array<{ t: number; joints: PoseJoints25 }>;
    createdAt: number;
};

export type DirectorKeyframe = {
    id: string;
    time: number;
    objectId: string;
    property: "position" | "rotation" | "scale" | "target" | "fov" | "roll";
    value: number | [number, number, number];
};

export type DirectorActionClip = {
    id: string;
    characterId: string;
    actionId: string;
    actionName: string;
    mode: "action" | "pose";
    startTime: number;
    duration: number;
    poseFrame?: number;
};

export type DirectorStoryboardCut = {
    id: string;
    cameraId: string;
    startTime: number;
    duration: number;
    label?: string;
};

export type DirectorTimelineState = {
    fps: 24 | 25 | 30 | 50 | 60;
    duration: number;
    loop: boolean;
    hideEmptyTracks: boolean;
    keyframes: DirectorKeyframe[];
    actionClips: DirectorActionClip[];
    storyboardCuts: DirectorStoryboardCut[];
};

export type DirectorSceneContent = {
    characters: DirectorCharacterItem[];
    props: DirectorPropItem[];
    cameras: DirectorCameraItem[];
    activeCameraId: string;
    environment: DirectorEnvironment;
    backgroundKind?: "none" | "panorama" | "plane";
    backgroundUrl?: string;
    timeline: DirectorTimelineState;
};

export type DirectorRevision = {
    id: string;
    label: string;
    savedAt: number;
    mode: "static" | "dynamic";
    scene: DirectorSceneContent;
};

export type DirectorSnapshot = {
    id: string;
    title: string;
    cameraName: string;
    aspectRatio: string;
    dataUrl: string;
    storageKey?: string;
    createdAt: number;
};

export type DirectorStageState = {
    mode?: "static" | "dynamic";
    aspectRatio: string;
    scenePrompt: string;
    skyColor: string;
    panoramaUrl?: string;
    backgroundKind?: "none" | "panorama" | "plane";
    showLabels: boolean;
    gridSnap: boolean;
    viewSettings?: DirectorViewSettings;
    environment?: DirectorEnvironment;
    characters: DirectorCharacterItem[];
    props?: DirectorPropItem[];
    cameras: DirectorCameraItem[];
    activeCameraId: string;
    pipCameraId?: string; // "storyboard" or camera id
    timeline?: DirectorTimelineState;
    dynamicScene?: DirectorSceneContent;
    backgrounds?: DirectorBackgroundItem[];
    customAssets?: DirectorCustomAsset[];
    customActions?: DirectorCustomAction[];
    revisions?: DirectorRevision[];
    snapshots: DirectorSnapshot[];
};

export type CanvasNodeMetadata = {
    directorData?: DirectorStageState;
    workflowAssetUrls?: Record<string, string>;
    characterRecipe?: CharacterRecipe;
    workflowDisplayVersion?: number;
    cropContext?: CanvasCropContext;
    fusionColorMatch?: boolean;
    llmOutputMode?: "text" | "list";
    llmChannelId?: string;
    llmOutputNodeId?: string;
    llmSummary?: string;
    table?: import("@/lib/canvas/dxos-table").DxTable;
    tableRowsFromData?: boolean;
    tableInputChannels?: import("@/lib/canvas/dxos-table").DxInputChannel[];
    tableBatchConcurrency?: number;
    tableBatchStartRow?: number;
    tableBatchManualSelection?: boolean;
    tableBatchSelectedRows?: number[];
    tableBatchRun?: import("@/lib/canvas/dxos-table").DxBatchRun;
    content?: string;
    /** 编辑面板（调色等）正在预览时的临时 CSS filter，确认或关闭后清除。 */
    previewFilter?: string;
    composerContent?: string;
    prompt?: string;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    generationStartedAt?: number;
    generationDurationMs?: number;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    /** 派生结果所属系列的原始节点 id；同一系列的结果按 generationSlot 排网格。 */
    generationOriginId?: string;
    /** 该结果在系列里的序号：floor(slot / 4) 为排号，slot % 4 为列号。 */
    generationSlot?: number;
    model?: string;
    reasoningEffort?: "auto" | "low" | "medium" | "high" | "xhigh";
    size?: string;
    imageResolution?: string;
    imageAspectRatio?: string;
    imageCompressionEnabled?: boolean;
    imageCompressionResolution?: "1k" | "2k" | "4k";
    imageCompressionMaxMb?: number;
    quality?: string;
    background?: string;
    count?: number;
    textCount?: number;
    texts?: CanvasNodeText[];
    primaryTextId?: string;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    videoMode?: string;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    referenceNodeOrder?: string[];
    references?: string[];
    naturalWidth?: number;
    naturalHeight?: number;
    freeResize?: boolean;
    imageSizeManual?: boolean;
    images?: CanvasNodeImage[];
    primaryImageId?: string;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
    videoTaskId?: string;
    videoTaskProvider?: "openai" | "gemini" | "sand" | "autodl" | "routerapi";
    groupId?: string;
    groupColor?: string;
    interactive?: boolean; // Plugin node interaction/move state; see CanvasNodeDefinition.interactionToggle.
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeTypeId;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    toPort?: string;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeTypeId;
    title: string;
    dataUrl?: string;
    storageKey?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant" | "system" | "tool" | "error";
    title?: string;
    text: string;
    meta?: string;
    detail?: unknown;
    references?: CanvasAssistantReference[];
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
    portId?: string;
    // Snapshot the selected outputs at drag start; later selection changes must not change this connection.
    sourceNodeIds?: string[];
    batchPointer?: { id: number; start: Position };
};

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    additive: boolean;
    initialSelectedNodeIds: string[];
};

export type ContextMenuState =
    | {
          type: "node";
          x: number;
          y: number;
          nodeId: string;
      }
    | {
          type: "connection";
          x: number;
          y: number;
          connectionId: string;
      };
