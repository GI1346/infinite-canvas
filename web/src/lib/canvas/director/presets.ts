import { nanoid } from "nanoid";
import type {
    DirectorCameraItem,
    DirectorCharacterBodyType,
    DirectorCharacterItem,
    DirectorCustomAction,
    DirectorEnvironment,
    DirectorKeyframe,
    DirectorPropItem,
    DirectorStageState,
    DirectorTimelineState,
    DirectorViewSettings,
    PoseJoints25,
} from "@/types/canvas";

export const DIRECTOR_ASPECT_RATIOS = [
    { value: "1:1", label: "1:1", ratio: 1 },
    { value: "4:3", label: "4:3", ratio: 4 / 3 },
    { value: "3:4", label: "3:4", ratio: 3 / 4 },
    { value: "16:9", label: "16:9", ratio: 16 / 9 },
    { value: "9:16", label: "9:16", ratio: 9 / 16 },
    { value: "2.39:1", label: "2.39:1", ratio: 2.39 },
] as const;

export type CharacterPresetDef = {
    value: DirectorCharacterBodyType;
    label: string;
    gender: "male" | "female";
    heightM: number;
    scale: [number, number, number];
    defaultColor: string;
    tag: string;
};

/** 全部 12 个内置角色体型预设（与即梦 3D 导演台完全对齐） */
export const DIRECTOR_CHARACTER_PRESETS: CharacterPresetDef[] = [
    { value: "male_standard", label: "男性 · 标准", gender: "male", heightM: 1.78, scale: [1.0, 1.0, 1.0], defaultColor: "#a07d8b", tag: "标准" },
    { value: "female_standard", label: "女性 · 标准", gender: "female", heightM: 1.66, scale: [0.88, 0.93, 0.88], defaultColor: "#b88c9e", tag: "标准" },
    { value: "male_teen", label: "男性 · 少年", gender: "male", heightM: 1.62, scale: [0.88, 0.9, 0.86], defaultColor: "#7e9bb0", tag: "少年" },
    { value: "female_teen", label: "女性 · 少年", gender: "female", heightM: 1.54, scale: [0.82, 0.86, 0.82], defaultColor: "#9cb0c9", tag: "少年" },
    { value: "male_child", label: "男性 · 儿童", gender: "male", heightM: 1.22, scale: [0.74, 0.69, 0.74], defaultColor: "#86ad9b", tag: "儿童" },
    { value: "female_child", label: "女性 · 儿童", gender: "female", heightM: 1.18, scale: [0.7, 0.66, 0.7], defaultColor: "#98bfad", tag: "儿童" },
    { value: "male_slim", label: "男性 · 纤瘦", gender: "male", heightM: 1.8, scale: [0.84, 1.01, 0.82], defaultColor: "#8f8da8", tag: "纤瘦" },
    { value: "female_slim", label: "女性 · 纤瘦", gender: "female", heightM: 1.68, scale: [0.78, 0.95, 0.78], defaultColor: "#a89bb8", tag: "纤瘦" },
    { value: "male_muscular", label: "男性 · 健壮", gender: "male", heightM: 1.86, scale: [1.22, 1.04, 1.18], defaultColor: "#8d99a6", tag: "健壮" },
    { value: "female_muscular", label: "女性 · 健壮", gender: "female", heightM: 1.72, scale: [1.02, 0.97, 1.0], defaultColor: "#9e97a8", tag: "健壮" },
    { value: "male_plump", label: "男性 · 丰腴", gender: "male", heightM: 1.76, scale: [1.28, 0.99, 1.32], defaultColor: "#a68e7e", tag: "丰腴" },
    { value: "female_plump", label: "女性 · 丰腴", gender: "female", heightM: 1.64, scale: [1.14, 0.92, 1.18], defaultColor: "#b89b8d", tag: "丰腴" },
];

export function resolveCharacterPreset(bodyType: DirectorCharacterBodyType): CharacterPresetDef {
    const legacyMap: Record<string, DirectorCharacterBodyType> = {
        male: "male_standard",
        female: "female_standard",
        muscular: "male_muscular",
        slim: "female_slim",
        teen: "male_teen",
        child: "male_child",
        crowd: "male_standard",
        prop: "male_standard",
    };
    const key = legacyMap[bodyType] || bodyType;
    return DIRECTOR_CHARACTER_PRESETS.find((c) => c.value === key) || DIRECTOR_CHARACTER_PRESETS[0];
}

export type PropCategory = "几何体" | "家具" | "建筑" | "自然" | "街道" | "办公" | "厨房" | "卫浴" | "日用";

export type PropPresetDef = {
    id: string;
    name: string;
    category: PropCategory;
    isGeometry?: boolean;
    height: number;
    dimensions: [number, number, number];
    color: string;
};

/** 13 个基础几何体预设 */
export const DIRECTOR_GEOMETRY_PRESETS: PropPresetDef[] = [
    { id: "geo_simple_human", name: "简化人体", category: "几何体", isGeometry: true, height: 1.75, dimensions: [0.5, 1.75, 0.32], color: "#8fa8a0" },
    { id: "geo_cube", name: "立方体", category: "几何体", isGeometry: true, height: 1.0, dimensions: [1.0, 1.0, 1.0], color: "#8d96a5" },
    { id: "geo_sphere", name: "球体", category: "几何体", isGeometry: true, height: 1.0, dimensions: [1.0, 1.0, 1.0], color: "#8d96a5" },
    { id: "geo_box", name: "长方体", category: "几何体", isGeometry: true, height: 1.0, dimensions: [1.6, 1.0, 0.8], color: "#8d96a5" },
    { id: "geo_cylinder", name: "圆柱体", category: "几何体", isGeometry: true, height: 1.2, dimensions: [0.8, 1.2, 0.8], color: "#8d96a5" },
    { id: "geo_cone", name: "圆锥体", category: "几何体", isGeometry: true, height: 1.2, dimensions: [0.9, 1.2, 0.9], color: "#8d96a5" },
    { id: "geo_pyramid", name: "四棱锥", category: "几何体", isGeometry: true, height: 1.2, dimensions: [1.0, 1.2, 1.0], color: "#8d96a5" },
    { id: "geo_torus", name: "圆环体", category: "几何体", isGeometry: true, height: 1.0, dimensions: [1.0, 1.0, 0.3], color: "#8d96a5" },
    { id: "geo_plane", name: "基础平面", category: "几何体", isGeometry: true, height: 0.04, dimensions: [2.4, 0.04, 2.4], color: "#76808f" },
    { id: "geo_capsule", name: "胶囊体", category: "几何体", isGeometry: true, height: 1.4, dimensions: [0.6, 1.4, 0.6], color: "#8d96a5" },
    { id: "geo_disc", name: "圆盘", category: "几何体", isGeometry: true, height: 0.08, dimensions: [1.4, 0.08, 1.4], color: "#8d96a5" },
    { id: "geo_half_arch", name: "半圆弧", category: "几何体", isGeometry: true, height: 1.2, dimensions: [1.6, 1.2, 0.32], color: "#8d96a5" },
    { id: "geo_half_cylinder", name: "半圆柱", category: "几何体", isGeometry: true, height: 1.2, dimensions: [1.0, 1.2, 0.5], color: "#8d96a5" },
];

/** 全部 71 个内置简模物体预设（家具18 / 建筑12 / 自然7 / 街道13 / 办公3 / 厨房7 / 卫浴5 / 日用6） */
export const DIRECTOR_OBJECT_PRESETS: PropPresetDef[] = [
    // 家具 (18)
    { id: "chair", name: "椅子", category: "家具", height: 0.9, dimensions: [0.5, 0.9, 0.5], color: "#9c8d7f" },
    { id: "stool", name: "圆凳", category: "家具", height: 0.48, dimensions: [0.38, 0.48, 0.38], color: "#9c8d7f" },
    { id: "armchair", name: "扶手椅", category: "家具", height: 0.88, dimensions: [0.82, 0.88, 0.8], color: "#8b837b" },
    { id: "sofa", name: "沙发", category: "家具", height: 0.88, dimensions: [2.1, 0.88, 0.9], color: "#7e8591" },
    { id: "square_table", name: "方桌", category: "家具", height: 0.75, dimensions: [1.0, 0.75, 1.0], color: "#9c8873" },
    { id: "long_table", name: "长桌", category: "家具", height: 0.75, dimensions: [1.8, 0.75, 0.9], color: "#9c8873" },
    { id: "round_table", name: "圆桌", category: "家具", height: 0.75, dimensions: [1.1, 0.75, 1.1], color: "#9c8873" },
    { id: "bed", name: "床", category: "家具", height: 0.55, dimensions: [1.8, 0.95, 2.1], color: "#8f98a6" },
    { id: "bookshelf", name: "书架", category: "家具", height: 1.8, dimensions: [1.1, 1.8, 0.36], color: "#8e7f6f" },
    { id: "low_cabinet", name: "矮柜", category: "家具", height: 0.72, dimensions: [1.5, 0.72, 0.45], color: "#8b837a" },
    { id: "wardrobe", name: "衣柜", category: "家具", height: 2.0, dimensions: [1.3, 2.0, 0.6], color: "#8c8277" },
    { id: "tv", name: "电视", category: "家具", height: 0.68, dimensions: [1.25, 0.76, 0.24], color: "#4e5662" },
    { id: "wall_tv", name: "壁挂电视", category: "家具", height: 0.7, dimensions: [1.35, 0.75, 0.08], color: "#464e5a" },
    { id: "floor_lamp", name: "落地灯", category: "家具", height: 1.65, dimensions: [0.42, 1.65, 0.42], color: "#b7aa8f" },
    { id: "table_lamp", name: "台灯", category: "家具", height: 0.5, dimensions: [0.3, 0.5, 0.3], color: "#c2b393" },
    { id: "carpet", name: "地毯", category: "家具", height: 0.02, dimensions: [2.6, 0.02, 1.8], color: "#6f7a87" },
    { id: "coffee_table", name: "茶几", category: "家具", height: 0.42, dimensions: [1.2, 0.42, 0.65], color: "#958676" },
    { id: "side_table", name: "边桌", category: "家具", height: 0.55, dimensions: [0.5, 0.55, 0.5], color: "#958676" },

    // 建筑 (12)
    { id: "wall", name: "墙体", category: "建筑", height: 2.6, dimensions: [3.4, 2.6, 0.22], color: "#7f8791" },
    { id: "pillar", name: "立柱", category: "建筑", height: 2.8, dimensions: [0.45, 2.8, 0.45], color: "#878f99" },
    { id: "stairs", name: "楼梯", category: "建筑", height: 1.5, dimensions: [1.4, 1.5, 2.2], color: "#828a94" },
    { id: "ramp", name: "坡道", category: "建筑", height: 0.8, dimensions: [1.6, 0.8, 2.4], color: "#828a94" },
    { id: "platform", name: "平台", category: "建筑", height: 0.3, dimensions: [2.4, 0.3, 2.4], color: "#79818c" },
    { id: "arch", name: "拱门", category: "建筑", height: 2.6, dimensions: [2.2, 2.6, 0.42], color: "#8a9099" },
    { id: "door", name: "门", category: "建筑", height: 2.1, dimensions: [1.0, 2.1, 0.14], color: "#8c7a69" },
    { id: "fence", name: "围栏", category: "建筑", height: 1.1, dimensions: [2.4, 1.1, 0.14], color: "#86817a" },
    { id: "ladder", name: "梯子", category: "建筑", height: 2.4, dimensions: [0.55, 2.4, 0.14], color: "#948470" },
    { id: "statue", name: "抽象雕像", category: "建筑", height: 2.0, dimensions: [0.85, 2.0, 0.85], color: "#9da5b0" },
    { id: "window", name: "窗户", category: "建筑", height: 1.2, dimensions: [1.4, 1.2, 0.12], color: "#7fa5b8" },
    { id: "railing", name: "栏杆", category: "建筑", height: 1.05, dimensions: [2.2, 1.05, 0.12], color: "#8a929e" },

    // 自然 (7)
    { id: "small_tree", name: "小树", category: "自然", height: 3.5, dimensions: [1.8, 3.5, 1.8], color: "#5e8c6a" },
    { id: "big_tree", name: "大树", category: "自然", height: 7.0, dimensions: [3.6, 7.0, 3.6], color: "#4e7c5c" },
    { id: "rock", name: "石头", category: "自然", height: 0.8, dimensions: [1.1, 0.8, 0.95], color: "#7c8188" },
    { id: "bush", name: "灌木", category: "自然", height: 1.0, dimensions: [1.3, 1.0, 1.2], color: "#5a8263" },
    { id: "potted_plant", name: "盆栽", category: "自然", height: 1.2, dimensions: [0.55, 1.2, 0.55], color: "#648f6e" },
    { id: "stump", name: "树桩", category: "自然", height: 0.6, dimensions: [0.65, 0.6, 0.65], color: "#7f6956" },
    { id: "flowerbed", name: "花坛", category: "自然", height: 0.5, dimensions: [2.0, 0.5, 1.1], color: "#6e876e" },

    // 街道 (13)
    { id: "car", name: "轿车", category: "街道", height: 1.5, dimensions: [1.85, 1.5, 4.3], color: "#7c8c9e" },
    { id: "truck", name: "卡车", category: "街道", height: 2.6, dimensions: [2.25, 2.6, 5.6], color: "#838f99" },
    { id: "bicycle", name: "自行车", category: "街道", height: 1.15, dimensions: [0.55, 1.15, 1.75], color: "#7e94a3" },
    { id: "motorcycle", name: "摩托车", category: "街道", height: 1.2, dimensions: [0.75, 1.2, 2.05], color: "#6b7785" },
    { id: "street_lamp", name: "路灯", category: "街道", height: 3.8, dimensions: [0.7, 3.8, 0.45], color: "#77808c" },
    { id: "bench", name: "长椅", category: "街道", height: 0.85, dimensions: [1.7, 0.85, 0.65], color: "#8c7a68" },
    { id: "trash_can", name: "垃圾桶", category: "街道", height: 1.0, dimensions: [0.55, 1.0, 0.55], color: "#6c7b78" },
    { id: "traffic_cone", name: "路锥", category: "街道", height: 0.7, dimensions: [0.42, 0.7, 0.42], color: "#c9744d" },
    { id: "barrier", name: "水马", category: "街道", height: 1.0, dimensions: [1.6, 1.0, 0.48], color: "#c26c51" },
    { id: "road_sign", name: "路牌", category: "街道", height: 2.4, dimensions: [0.65, 2.4, 0.2], color: "#6f8fa8" },
    { id: "hydrant", name: "消防栓", category: "街道", height: 0.85, dimensions: [0.4, 0.85, 0.4], color: "#b55b5b" },
    { id: "oil_drum", name: "油桶", category: "街道", height: 0.9, dimensions: [0.6, 0.9, 0.6], color: "#6c7f8c" },
    { id: "wood_crate", name: "木箱", category: "街道", height: 0.65, dimensions: [0.75, 0.65, 0.75], color: "#9c8364" },

    // 办公 (3)
    { id: "desk", name: "书桌", category: "办公", height: 0.75, dimensions: [1.45, 0.75, 0.75], color: "#948474" },
    { id: "monitor", name: "显示器", category: "办公", height: 0.48, dimensions: [0.62, 0.48, 0.18], color: "#525a66" },
    { id: "laptop", name: "笔记本电脑", category: "办公", height: 0.22, dimensions: [0.36, 0.22, 0.26], color: "#6b7380" },

    // 厨房 (7)
    { id: "fridge", name: "冰箱", category: "厨房", height: 1.85, dimensions: [0.78, 1.85, 0.72], color: "#a4adb8" },
    { id: "stove", name: "灶台", category: "厨房", height: 0.9, dimensions: [0.9, 0.9, 0.65], color: "#7a828c" },
    { id: "kitchen_sink", name: "厨房水槽", category: "厨房", height: 1.2, dimensions: [1.0, 1.2, 0.65], color: "#929ba6" },
    { id: "kitchen_counter", name: "厨房台面", category: "厨房", height: 0.9, dimensions: [1.8, 0.9, 0.65], color: "#8e949c" },
    { id: "kitchen_island", name: "厨房岛台", category: "厨房", height: 0.92, dimensions: [1.9, 0.92, 0.95], color: "#878d96" },
    { id: "microwave", name: "微波炉", category: "厨房", height: 0.3, dimensions: [0.52, 0.3, 0.38], color: "#666e7a" },
    { id: "wall_cabinet", name: "吊柜", category: "厨房", height: 0.7, dimensions: [1.4, 0.7, 0.38], color: "#969087" },

    // 卫浴 (5)
    { id: "toilet", name: "马桶", category: "卫浴", height: 0.8, dimensions: [0.46, 0.8, 0.68], color: "#b6bcc4" },
    { id: "washbasin", name: "洗手盆", category: "卫浴", height: 0.85, dimensions: [0.75, 0.85, 0.5], color: "#b2b9c2" },
    { id: "bathtub", name: "浴缸", category: "卫浴", height: 0.6, dimensions: [1.7, 0.6, 0.8], color: "#b8bec7" },
    { id: "shower", name: "淋浴间", category: "卫浴", height: 2.1, dimensions: [1.0, 2.1, 1.0], color: "#89a3b3" },
    { id: "washing_machine", name: "洗衣机", category: "卫浴", height: 0.9, dimensions: [0.65, 0.9, 0.65], color: "#a6aeb8" },

    // 日用 (6)
    { id: "cardboard_box", name: "纸箱", category: "日用", height: 0.5, dimensions: [0.58, 0.5, 0.46], color: "#a38a6d" },
    { id: "suitcase", name: "行李箱", category: "日用", height: 0.75, dimensions: [0.46, 0.75, 0.28], color: "#6e7f91" },
    { id: "mug", name: "马克杯", category: "日用", height: 0.1, dimensions: [0.1, 0.1, 0.1], color: "#b0b8c2" },
    { id: "mirror", name: "镜子", category: "日用", height: 0.9, dimensions: [0.68, 0.9, 0.06], color: "#97b2c4" },
    { id: "chandelier", name: "吊灯", category: "日用", height: 0.9, dimensions: [0.7, 0.9, 0.7], color: "#c7ba97" },
    { id: "ceiling_fan", name: "吊扇", category: "日用", height: 0.25, dimensions: [1.2, 0.25, 1.2], color: "#8e96a1" },
];

export const ALL_PROP_PRESETS: PropPresetDef[] = [...DIRECTOR_GEOMETRY_PRESETS, ...DIRECTOR_OBJECT_PRESETS];

export type DirectorCameraPreset = {
    id: string;
    name: string;
    kind: "current" | "single" | "dual";
    offset: [number, number, number];
    targetOffset: [number, number, number];
    fov: number;
    roll?: number;
    desc: string;
};

/** 全部 14 个机位预设（当前视角 + 12 单对象构图 + 过肩镜头） */
export const DIRECTOR_CAMERA_PRESETS: DirectorCameraPreset[] = [
    { id: "current", name: "当前视角", kind: "current", offset: [0, 2.2, 7], targetOffset: [0, 1, 0], fov: 50, desc: "直接按当前导演视角创建新机位" },
    { id: "front_mid", name: "正面中景", kind: "single", offset: [0, 1.45, 3.6], targetOffset: [0, 1.15, 0], fov: 46, desc: "标准腰部以上正面构图" },
    { id: "front_close", name: "正面特写", kind: "single", offset: [0, 1.56, 1.45], targetOffset: [0, 1.5, 0], fov: 36, desc: "头部与表情细节特写" },
    { id: "front_full", name: "正面全景", kind: "single", offset: [0, 1.55, 6.4], targetOffset: [0, 0.95, 0], fov: 52, desc: "全身与周围空间关系" },
    { id: "side_follow", name: "侧面跟拍", kind: "single", offset: [4.0, 1.45, 0.2], targetOffset: [0, 1.15, 0], fov: 48, desc: "侧身运动与走位跟拍" },
    { id: "side_close", name: "侧面近景", kind: "single", offset: [2.0, 1.5, 0.35], targetOffset: [0, 1.38, 0], fov: 40, desc: "侧面轮廓与视线情绪" },
    { id: "back_mid", name: "背面中景", kind: "single", offset: [0, 1.5, -3.6], targetOffset: [0, 1.18, 0], fov: 48, desc: "背影叙事与空间纵深" },
    { id: "high_full", name: "俯拍全景", kind: "single", offset: [0, 5.8, 4.6], targetOffset: [0, 0.8, 0], fov: 52, desc: "高机位交代群像与调度" },
    { id: "high_45", name: "45° 俯拍", kind: "single", offset: [3.0, 3.6, 3.4], targetOffset: [0, 1.0, 0], fov: 48, desc: "立体空间透视俯拍" },
    { id: "low_angle", name: "低角度仰拍", kind: "single", offset: [0.45, 0.42, 3.0], targetOffset: [0, 1.45, 0], fov: 50, desc: "强化角色气场与压迫感" },
    { id: "low_wide", name: "低角度广角", kind: "single", offset: [-1.1, 0.35, 3.2], targetOffset: [0, 1.35, 0], fov: 68, desc: "夸张透视与张力构图" },
    { id: "bird_eye", name: "鸟瞰", kind: "single", offset: [0, 8.6, 0.35], targetOffset: [0, 0, 0], fov: 54, desc: "垂直俯视平面调度视角" },
    { id: "dutch", name: "荷兰角", kind: "single", offset: [2.2, 1.2, 3.2], targetOffset: [0, 1.2, 0], fov: 50, roll: 16, desc: "倾斜地平线营造不安感" },
    { id: "ots", name: "过肩镜头", kind: "dual", offset: [-0.85, 1.58, 1.35], targetOffset: [0, 1.42, 0], fov: 42, desc: "选择前景角色和注视点" },
];

/** 4 套环境与三点布光预设（完全对齐即梦默认参数） */
export const DIRECTOR_ENVIRONMENT_PRESETS: Record<DirectorEnvironment["preset"], { label: string; env: DirectorEnvironment }> = {
    studio: {
        label: "影棚",
        env: {
            preset: "studio",
            backgroundColor: "#171717",
            groundColor: "#242424",
            showGround: true,
            groundOpacity: 50,
            exposure: 1.05,
            showGrid: true,
            keyLight: { color: "#ffffff", intensity: 3.4, azimuth: -34, elevation: 51, castShadow: true },
            fillLight: { color: "#ffffff", intensity: 2.1 },
            rimLight: { color: "#ffffff", intensity: 1.1 },
        },
    },
    daylight: {
        label: "柔和日光",
        env: {
            preset: "daylight",
            backgroundColor: "#232a35",
            groundColor: "#2e3540",
            showGround: true,
            groundOpacity: 62,
            exposure: 1.18,
            showGrid: true,
            keyLight: { color: "#fff7e8", intensity: 3.9, azimuth: -22, elevation: 62, castShadow: true },
            fillLight: { color: "#d8ebff", intensity: 2.4 },
            rimLight: { color: "#ffffff", intensity: 0.95 },
        },
    },
    sunset: {
        label: "暖色夕阳",
        env: {
            preset: "sunset",
            backgroundColor: "#221918",
            groundColor: "#2b201d",
            showGround: true,
            groundOpacity: 56,
            exposure: 1.1,
            showGrid: true,
            keyLight: { color: "#ffab6b", intensity: 4.1, azimuth: -62, elevation: 22, castShadow: true },
            fillLight: { color: "#7a86b8", intensity: 1.4 },
            rimLight: { color: "#ffd29e", intensity: 1.85 },
        },
    },
    night: {
        label: "蓝调夜景",
        env: {
            preset: "night",
            backgroundColor: "#0d1320",
            groundColor: "#161e2e",
            showGround: true,
            groundOpacity: 54,
            exposure: 0.96,
            showGrid: true,
            keyLight: { color: "#9bc4ff", intensity: 2.6, azimuth: 38, elevation: 44, castShadow: true },
            fillLight: { color: "#3d5885", intensity: 1.55 },
            rimLight: { color: "#37d39b", intensity: 1.75 },
        },
    },
};

export const DEFAULT_VIEW_SETTINGS: DirectorViewSettings = {
    ground: true,
    grid: true,
    motionPaths: true,
    objectNames: true,
    heightGuides: true,
    cameraFrameMask: true,
    viewIndicator: true,
};

/** 7 大折叠骨骼关节组（共 25 个自由度） */
export type JointSliderDef = { key: keyof PoseJoints25; label: string; min: number; max: number };
export const DIRECTOR_JOINT_GROUPS: Array<{ id: string; label: string; sliders: JointSliderDef[] }> = [
    {
        id: "body",
        label: "身体整体",
        sliders: [
            { key: "bodyPitch", label: "前后倾", min: -75, max: 75 },
            { key: "bodyYaw", label: "转身", min: -180, max: 180 },
            { key: "bodyRoll", label: "侧倾", min: -60, max: 60 },
        ],
    },
    {
        id: "chest",
        label: "胸腰",
        sliders: [
            { key: "chestPitch", label: "前后倾", min: -55, max: 75 },
            { key: "chestYaw", label: "转身", min: -65, max: 65 },
            { key: "chestRoll", label: "侧倾", min: -45, max: 45 },
        ],
    },
    {
        id: "head",
        label: "头部",
        sliders: [
            { key: "headPitch", label: "点头", min: -50, max: 50 },
            { key: "headYaw", label: "转头", min: -75, max: 75 },
            { key: "headRoll", label: "歪头", min: -45, max: 45 },
        ],
    },
    {
        id: "leftArm",
        label: "左臂",
        sliders: [
            { key: "leftArmPitch", label: "左臂 · 前后摆", min: -165, max: 90 },
            { key: "leftArmAbduct", label: "左臂 · 内收外展", min: -30, max: 165 },
            { key: "leftArmTwist", label: "左臂 · 内旋外旋", min: -90, max: 90 },
            { key: "leftArmBend", label: "左臂 · 屈伸", min: 0, max: 145 },
        ],
    },
    {
        id: "rightArm",
        label: "右臂",
        sliders: [
            { key: "rightArmPitch", label: "右臂 · 前后摆", min: -165, max: 90 },
            { key: "rightArmAbduct", label: "右臂 · 内收外展", min: -30, max: 165 },
            { key: "rightArmTwist", label: "右臂 · 内旋外旋", min: -90, max: 90 },
            { key: "rightArmBend", label: "右臂 · 屈伸", min: 0, max: 145 },
        ],
    },
    {
        id: "leftLeg",
        label: "左腿",
        sliders: [
            { key: "leftLegPitch", label: "左腿 · 前后摆", min: -120, max: 85 },
            { key: "leftLegAbduct", label: "左腿 · 内收外展", min: -25, max: 85 },
            { key: "leftLegTwist", label: "左腿 · 内旋外旋", min: -60, max: 60 },
            { key: "leftLegBend", label: "左腿 · 屈伸", min: 0, max: 140 },
        ],
    },
    {
        id: "rightLeg",
        label: "右腿",
        sliders: [
            { key: "rightLegPitch", label: "右腿 · 前后摆", min: -120, max: 85 },
            { key: "rightLegAbduct", label: "右腿 · 内收外展", min: -25, max: 85 },
            { key: "rightLegTwist", label: "右腿 · 内旋外旋", min: -60, max: 60 },
            { key: "rightLegBend", label: "右腿 · 屈伸", min: 0, max: 140 },
        ],
    },
];

export function emptyJoints(): PoseJoints25 {
    return {
        bodyPitch: 0, bodyYaw: 0, bodyRoll: 0,
        chestPitch: 0, chestYaw: 0, chestRoll: 0,
        headPitch: 0, headYaw: 0, headRoll: 0,
        leftArmPitch: 8, leftArmAbduct: 10, leftArmTwist: 0, leftArmBend: 10,
        rightArmPitch: 8, rightArmAbduct: 10, rightArmTwist: 0, rightArmBend: 10,
        leftLegPitch: 0, leftLegAbduct: 4, leftLegTwist: 0, leftLegBend: 0,
        rightLegPitch: 0, rightLegAbduct: 4, rightLegTwist: 0, rightLegBend: 0,
    };
}

/** 兼容旧版 8 关节数据到新版 25 关节数据 */
export function normalizeJoints(j?: PoseJoints25): PoseJoints25 {
    const base = emptyJoints();
    if (!j) return base;
    return {
        ...base,
        ...j,
        chestPitch: j.chestPitch ?? j.torsoPitch ?? base.chestPitch,
        leftArmPitch: j.leftArmPitch ?? j.leftArm ?? base.leftArmPitch,
        rightArmPitch: j.rightArmPitch ?? j.rightArm ?? base.rightArmPitch,
        leftArmBend: j.leftArmBend ?? j.leftElbow ?? base.leftArmBend,
        rightArmBend: j.rightArmBend ?? j.rightElbow ?? base.rightArmBend,
        leftLegPitch: j.leftLegPitch ?? j.leftLeg ?? base.leftLegPitch,
        rightLegPitch: j.rightLegPitch ?? j.rightLeg ?? base.rightLegPitch,
    };
}

export type DirectorActionPreset = {
    id: string;
    name: string;
    category: "站姿与待机" | "坐卧与倚靠" | "行走与奔跑" | "交谈与社交" | "情绪与表演" | "动作与格斗" | "日常与工作";
    durationSec: number;
    keyframes: Array<{ t: number; joints: PoseJoints25 }>;
};

const kf = (t: number, patch: PoseJoints25) => ({ t, joints: { ...emptyJoints(), ...patch } });

/** 丰富的内置动作/姿势素材库（支持时间轴播放与逐帧截取为静态姿势） */
export const DIRECTOR_ACTION_PRESETS: DirectorActionPreset[] = [
    // 站姿与待机
    { id: "stand_idle", name: "自然站立", category: "站姿与待机", durationSec: 2.5, keyframes: [kf(0, {}), kf(0.5, { chestPitch: 2, headYaw: 5, leftArmBend: 14, rightArmBend: 14 }), kf(1, {})] },
    { id: "t_pose", name: "T 型标准", category: "站姿与待机", durationSec: 2, keyframes: [kf(0, { leftArmAbduct: 90, rightArmAbduct: 90, leftArmPitch: 0, rightArmPitch: 0, leftArmBend: 0, rightArmBend: 0 }), kf(1, { leftArmAbduct: 90, rightArmAbduct: 90, leftArmPitch: 0, rightArmPitch: 0, leftArmBend: 0, rightArmBend: 0 })] },
    { id: "a_pose", name: "A 型标准", category: "站姿与待机", durationSec: 2, keyframes: [kf(0, { leftArmAbduct: 42, rightArmAbduct: 42, leftArmBend: 4, rightArmBend: 4, leftLegAbduct: 8, rightLegAbduct: 8 }), kf(1, { leftArmAbduct: 42, rightArmAbduct: 42, leftArmBend: 4, rightArmBend: 4, leftLegAbduct: 8, rightLegAbduct: 8 })] },
    { id: "hands_on_hips", name: "双手叉腰", category: "站姿与待机", durationSec: 2.5, keyframes: [kf(0, { chestPitch: -3, headYaw: 6, leftArmAbduct: 42, rightArmAbduct: 42, leftArmBend: 92, rightArmBend: 92, leftLegAbduct: 10, rightLegAbduct: 10 }), kf(0.5, { chestPitch: -5, headYaw: -6, leftArmAbduct: 44, rightArmAbduct: 44, leftArmBend: 94, rightArmBend: 94 }), kf(1, { chestPitch: -3, headYaw: 6, leftArmAbduct: 42, rightArmAbduct: 42, leftArmBend: 92, rightArmBend: 92 })] },
    { id: "arms_crossed", name: "抱臂凝视", category: "站姿与待机", durationSec: 3, keyframes: [kf(0, { chestYaw: -8, headYaw: 10, leftArmPitch: -36, rightArmPitch: -36, leftArmAbduct: -18, rightArmAbduct: -18, leftArmBend: 106, rightArmBend: 106 }), kf(0.5, { chestYaw: -10, headPitch: 6, headYaw: 14, leftArmPitch: -38, rightArmPitch: -38, leftArmBend: 108, rightArmBend: 108 }), kf(1, { chestYaw: -8, headYaw: 10, leftArmPitch: -36, rightArmPitch: -36, leftArmBend: 106, rightArmBend: 106 })] },
    { id: "look_around", name: "环顾四周", category: "站姿与待机", durationSec: 3.2, keyframes: [kf(0, { headYaw: 0 }), kf(0.3, { headYaw: -55, chestYaw: -18 }), kf(0.7, { headYaw: 55, chestYaw: 18 }), kf(1, { headYaw: 0 })] },
    { id: "military_stand", name: "立正军姿", category: "站姿与待机", durationSec: 2, keyframes: [kf(0, { chestPitch: -5, leftArmAbduct: 4, rightArmAbduct: 4, leftArmBend: 4, rightArmBend: 4, leftLegAbduct: 2, rightLegAbduct: 2 }), kf(1, { chestPitch: -5, leftArmAbduct: 4, rightArmAbduct: 4 })] },
    { id: "hero_pose", name: "英雄仰望", category: "站姿与待机", durationSec: 2.5, keyframes: [kf(0, { chestPitch: -10, headPitch: -18, leftArmAbduct: 22, rightArmAbduct: 28, leftArmBend: 30, rightArmBend: 42, leftLegAbduct: 14, rightLegAbduct: 14, leftLegPitch: -10, rightLegPitch: 12 }), kf(1, { chestPitch: -12, headPitch: -22, leftArmAbduct: 24, rightArmAbduct: 30 })] },

    // 坐卧与倚靠
    { id: "sit_normal", name: "标准坐姿", category: "坐卧与倚靠", durationSec: 2.5, keyframes: [kf(0, { chestPitch: -4, leftArmPitch: -26, rightArmPitch: -26, leftArmBend: 62, rightArmBend: 62, leftLegPitch: -88, rightLegPitch: -88, leftLegBend: 88, rightLegBend: 88 }), kf(0.5, { chestPitch: 2, headYaw: 12, leftArmPitch: -30, rightArmPitch: -24, leftArmBend: 68, rightArmBend: 60, leftLegPitch: -88, rightLegPitch: -88, leftLegBend: 88, rightLegBend: 88 }), kf(1, { chestPitch: -4, leftArmPitch: -26, rightArmPitch: -26, leftArmBend: 62, rightArmBend: 62, leftLegPitch: -88, rightLegPitch: -88, leftLegBend: 88, rightLegBend: 88 })] },
    { id: "sit_relaxed", name: "慵懒翘腿坐", category: "坐卧与倚靠", durationSec: 3, keyframes: [kf(0, { bodyPitch: -12, chestPitch: -8, headRoll: 8, leftArmAbduct: 34, rightArmPitch: -22, rightArmBend: 72, leftLegPitch: -82, rightLegPitch: -96, leftLegBend: 82, rightLegBend: 96, rightLegAbduct: -15 }), kf(1, { bodyPitch: -12, chestPitch: -6, headRoll: -6, leftArmAbduct: 34, rightArmPitch: -22, rightArmBend: 72, leftLegPitch: -82, rightLegPitch: -96, leftLegBend: 82, rightLegBend: 96 })] },
    { id: "crouch", name: "低身蹲下", category: "坐卧与倚靠", durationSec: 2, keyframes: [kf(0, { chestPitch: 26, headPitch: -14, leftArmPitch: -38, rightArmPitch: -38, leftArmBend: 64, rightArmBend: 64, leftLegPitch: -78, rightLegPitch: -78, leftLegBend: 118, rightLegBend: 118 }), kf(1, { chestPitch: 24, headPitch: -12, leftArmPitch: -36, rightArmPitch: -36, leftArmBend: 62, rightArmBend: 62, leftLegPitch: -78, rightLegPitch: -78, leftLegBend: 118, rightLegBend: 118 })] },
    { id: "kneel_one", name: "单膝下跪", category: "坐卧与倚靠", durationSec: 2.5, keyframes: [kf(0, { chestPitch: 10, leftArmPitch: -22, rightArmPitch: 12, leftArmBend: 38, rightArmBend: 48, leftLegPitch: -84, leftLegBend: 92, rightLegPitch: 12, rightLegBend: 96 }), kf(1, { chestPitch: 12, leftArmPitch: -24, rightArmPitch: 10, leftArmBend: 40, rightArmBend: 48, leftLegPitch: -84, leftLegBend: 92, rightLegPitch: 12, rightLegBend: 96 })] },
    { id: "kneel_both", name: "双膝跪地", category: "坐卧与倚靠", durationSec: 2.5, keyframes: [kf(0, { chestPitch: 6, leftArmPitch: -18, rightArmPitch: -18, leftArmBend: 32, rightArmBend: 32, leftLegPitch: -16, rightLegPitch: -16, leftLegBend: 122, rightLegBend: 122 }), kf(1, { chestPitch: 6, leftLegPitch: -16, rightLegPitch: -16, leftLegBend: 122, rightLegBend: 122 })] },
    { id: "lean_shoulder", name: "单肩倚靠", category: "坐卧与倚靠", durationSec: 3, keyframes: [kf(0, { bodyRoll: -12, chestRoll: 6, headYaw: 22, leftArmAbduct: 18, rightArmPitch: -30, rightArmBend: 88, leftLegPitch: -14, leftLegAbduct: 14, rightLegPitch: 8 }), kf(1, { bodyRoll: -12, chestRoll: 8, headYaw: 14, leftArmAbduct: 18, rightArmPitch: -30, rightArmBend: 88, leftLegPitch: -14, rightLegPitch: 8 })] },
    { id: "lie_down", name: "平躺卧姿", category: "坐卧与倚靠", durationSec: 3, keyframes: [kf(0, { bodyPitch: -75, headPitch: 18, leftArmAbduct: 28, rightArmAbduct: 28, leftArmBend: 22, rightArmBend: 22, leftLegBend: 12, rightLegBend: 12 }), kf(1, { bodyPitch: -75, headPitch: 20, leftArmAbduct: 30, rightArmAbduct: 30 })] },

    // 行走与奔跑
    {
        id: "walk_normal", name: "正常行走", category: "行走与奔跑", durationSec: 1.2,
        keyframes: [
            kf(0, { chestPitch: 6, leftArmPitch: -28, rightArmPitch: 28, leftArmBend: 18, rightArmBend: 24, leftLegPitch: 28, rightLegPitch: -26, leftLegBend: 8, rightLegBend: 22 }),
            kf(0.25, { chestPitch: 4, leftArmPitch: 0, rightArmPitch: 0, leftArmBend: 14, rightArmBend: 14, leftLegPitch: 4, rightLegPitch: -4, leftLegBend: 26, rightLegBend: 6 }),
            kf(0.5, { chestPitch: 6, leftArmPitch: 28, rightArmPitch: -28, leftArmBend: 24, rightArmBend: 18, leftLegPitch: -26, rightLegPitch: 28, leftLegBend: 22, rightLegBend: 8 }),
            kf(0.75, { chestPitch: 4, leftArmPitch: 0, rightArmPitch: 0, leftArmBend: 14, rightArmBend: 14, leftLegPitch: -4, rightLegPitch: 4, leftLegBend: 6, rightLegBend: 26 }),
            kf(1, { chestPitch: 6, leftArmPitch: -28, rightArmPitch: 28, leftArmBend: 18, rightArmBend: 24, leftLegPitch: 28, rightLegPitch: -26, leftLegBend: 8, rightLegBend: 22 }),
        ],
    },
    {
        id: "walk_catwalk", name: "自信台步", category: "行走与奔跑", durationSec: 1.3,
        keyframes: [
            kf(0, { chestPitch: -4, chestYaw: 12, leftArmPitch: -22, rightArmPitch: 22, leftLegPitch: 30, rightLegPitch: -24, leftLegAbduct: -6, rightLegAbduct: -6 }),
            kf(0.5, { chestPitch: -4, chestYaw: -12, leftArmPitch: 22, rightArmPitch: -22, leftLegPitch: -24, rightLegPitch: 30, leftLegAbduct: -6, rightLegAbduct: -6 }),
            kf(1, { chestPitch: -4, chestYaw: 12, leftArmPitch: -22, rightArmPitch: 22, leftLegPitch: 30, rightLegPitch: -24, leftLegAbduct: -6, rightLegAbduct: -6 }),
        ],
    },
    {
        id: "walk_sneak", name: "潜行猫步", category: "行走与奔跑", durationSec: 1.6,
        keyframes: [
            kf(0, { chestPitch: 24, headPitch: -16, leftArmPitch: -32, rightArmPitch: 18, leftArmBend: 68, rightArmBend: 64, leftLegPitch: -34, rightLegPitch: 18, leftLegBend: 54, rightLegBend: 42 }),
            kf(0.5, { chestPitch: 26, headPitch: -18, leftArmPitch: 18, rightArmPitch: -32, leftArmBend: 64, rightArmBend: 68, leftLegPitch: 18, rightLegPitch: -34, leftLegBend: 42, rightLegBend: 54 }),
            kf(1, { chestPitch: 24, headPitch: -16, leftArmPitch: -32, rightArmPitch: 18, leftArmBend: 68, rightArmBend: 64, leftLegPitch: -34, rightLegPitch: 18, leftLegBend: 54, rightLegBend: 42 }),
        ],
    },
    {
        id: "run_jog", name: "慢跑", category: "行走与奔跑", durationSec: 0.85,
        keyframes: [
            kf(0, { chestPitch: 16, leftArmPitch: -54, rightArmPitch: 52, leftArmBend: 82, rightArmBend: 86, leftLegPitch: 46, rightLegPitch: -44, leftLegBend: 24, rightLegBend: 64 }),
            kf(0.5, { chestPitch: 16, leftArmPitch: 52, rightArmPitch: -54, leftArmBend: 86, rightArmBend: 82, leftLegPitch: -44, rightLegPitch: 46, leftLegBend: 64, rightLegBend: 24 }),
            kf(1, { chestPitch: 16, leftArmPitch: -54, rightArmPitch: 52, leftArmBend: 82, rightArmBend: 86, leftLegPitch: 46, rightLegPitch: -44, leftLegBend: 24, rightLegBend: 64 }),
        ],
    },
    {
        id: "run_sprint", name: "冲刺奔跑", category: "行走与奔跑", durationSec: 0.65,
        keyframes: [
            kf(0, { bodyPitch: 14, chestPitch: 22, leftArmPitch: -82, rightArmPitch: 74, leftArmBend: 96, rightArmBend: 98, leftLegPitch: 64, rightLegPitch: -62, leftLegBend: 30, rightLegBend: 84 }),
            kf(0.5, { bodyPitch: 14, chestPitch: 22, leftArmPitch: 74, rightArmPitch: -82, leftArmBend: 98, rightArmBend: 96, leftLegPitch: -62, rightLegPitch: 64, leftLegBend: 84, rightLegBend: 30 }),
            kf(1, { bodyPitch: 14, chestPitch: 22, leftArmPitch: -82, rightArmPitch: 74, leftArmBend: 96, rightArmBend: 98, leftLegPitch: 64, rightLegPitch: -62, leftLegBend: 30, rightLegBend: 84 }),
        ],
    },
    {
        id: "jump_up", name: "纵身跃起", category: "行走与奔跑", durationSec: 1.4,
        keyframes: [
            kf(0, { chestPitch: 22, leftArmPitch: 36, rightArmPitch: 36, leftArmBend: 48, rightArmBend: 48, leftLegPitch: -42, rightLegPitch: -42, leftLegBend: 72, rightLegBend: 72 }),
            kf(0.45, { chestPitch: -8, leftArmPitch: -145, rightArmPitch: -145, leftArmAbduct: 24, rightArmAbduct: 24, leftArmBend: 18, rightArmBend: 18, leftLegPitch: 16, rightLegPitch: -24, leftLegBend: 24, rightLegBend: 68 }),
            kf(1, { chestPitch: 14, leftArmPitch: -18, rightArmPitch: -18, leftLegPitch: -24, rightLegPitch: -24, leftLegBend: 42, rightLegBend: 42 }),
        ],
    },

    // 交谈与社交
    { id: "talk_gesture", name: "交谈手势", category: "交谈与社交", durationSec: 2.8, keyframes: [kf(0, { chestYaw: 6, headYaw: -6, leftArmPitch: -34, rightArmPitch: -44, leftArmBend: 76, rightArmBend: 84 }), kf(0.4, { chestYaw: -8, headPitch: 6, headYaw: 8, leftArmPitch: -48, rightArmPitch: -28, leftArmAbduct: 24, rightArmAbduct: 18, leftArmBend: 62, rightArmBend: 74 }), kf(0.75, { chestYaw: 10, headPitch: -4, leftArmPitch: -28, rightArmPitch: -56, rightArmAbduct: 30, rightArmBend: 56 }), kf(1, { chestYaw: 6, headYaw: -6, leftArmPitch: -34, rightArmPitch: -44, leftArmBend: 76, rightArmBend: 84 })] },
    { id: "argue_stand", name: "站姿争论", category: "交谈与社交", durationSec: 2.4, keyframes: [kf(0, { chestPitch: 12, headPitch: -6, leftArmPitch: -68, rightArmPitch: -52, leftArmAbduct: 38, rightArmAbduct: 28, leftArmBend: 58, rightArmBend: 72, leftLegPitch: -14, rightLegPitch: 14 }), kf(0.5, { chestPitch: 18, chestYaw: 14, leftArmPitch: -42, rightArmPitch: -88, rightArmAbduct: 42, rightArmBend: 28 }), kf(1, { chestPitch: 12, leftArmPitch: -68, rightArmPitch: -52, leftArmBend: 58, rightArmBend: 72 })] },
    { id: "wave_hand", name: "招手致意", category: "交谈与社交", durationSec: 2, keyframes: [kf(0, { headYaw: 6, rightArmPitch: -142, rightArmAbduct: 42, rightArmBend: 32 }), kf(0.25, { headRoll: 8, rightArmPitch: -148, rightArmAbduct: 58, rightArmBend: 48 }), kf(0.5, { headRoll: -6, rightArmPitch: -140, rightArmAbduct: 32, rightArmBend: 24 }), kf(0.75, { headRoll: 8, rightArmPitch: -148, rightArmAbduct: 58, rightArmBend: 48 }), kf(1, { headYaw: 6, rightArmPitch: -142, rightArmAbduct: 42, rightArmBend: 32 })] },
    { id: "bow_polite", name: "礼貌鞠躬", category: "交谈与社交", durationSec: 2.4, keyframes: [kf(0, {}), kf(0.45, { chestPitch: 52, headPitch: 14, leftArmPitch: 10, rightArmPitch: 10 }), kf(0.7, { chestPitch: 52, headPitch: 14 }), kf(1, {})] },
    { id: "handshake", name: "伸手握手", category: "交谈与社交", durationSec: 2, keyframes: [kf(0, { chestPitch: 8, rightArmPitch: -68, rightArmBend: 28, rightLegPitch: -12 }), kf(0.5, { chestPitch: 10, rightArmPitch: -74, rightArmBend: 34 }), kf(1, { chestPitch: 8, rightArmPitch: -68, rightArmBend: 28 })] },
    { id: "point_forward", name: "手指前方", category: "交谈与社交", durationSec: 2, keyframes: [kf(0, { chestYaw: -14, headYaw: 14, rightArmPitch: -92, rightArmAbduct: 8, rightArmBend: 6, leftArmAbduct: 24, leftArmBend: 62 }), kf(1, { chestYaw: -14, headYaw: 14, rightArmPitch: -92, rightArmBend: 6 })] },
    { id: "clap_hands", name: "鼓掌喝彩", category: "交谈与社交", durationSec: 1.5, keyframes: [kf(0, { leftArmPitch: -48, rightArmPitch: -48, leftArmAbduct: -18, rightArmAbduct: -18, leftArmBend: 88, rightArmBend: 88 }), kf(0.25, { leftArmPitch: -52, rightArmPitch: -52, leftArmAbduct: 12, rightArmAbduct: 12, leftArmBend: 74, rightArmBend: 74 }), kf(0.5, { leftArmPitch: -48, rightArmPitch: -48, leftArmAbduct: -18, rightArmAbduct: -18, leftArmBend: 88, rightArmBend: 88 }), kf(1, { leftArmPitch: -48, rightArmPitch: -48, leftArmAbduct: -18, rightArmAbduct: -18, leftArmBend: 88, rightArmBend: 88 })] },

    // 情绪与表演
    { id: "think", name: "托腮思考", category: "情绪与表演", durationSec: 3, keyframes: [kf(0, { chestPitch: 6, headPitch: 10, headYaw: -12, leftArmPitch: -34, leftArmBend: 86, rightArmPitch: -74, rightArmBend: 124 }), kf(0.5, { chestPitch: 8, headPitch: 14, headYaw: -6, leftArmPitch: -34, leftArmBend: 86, rightArmPitch: -76, rightArmBend: 126 }), kf(1, { chestPitch: 6, headPitch: 10, headYaw: -12, leftArmPitch: -34, leftArmBend: 86, rightArmPitch: -74, rightArmBend: 124 })] },
    { id: "pray", name: "双手祈祷", category: "情绪与表演", durationSec: 3, keyframes: [kf(0, { chestPitch: 8, headPitch: 16, leftArmPitch: -56, rightArmPitch: -56, leftArmAbduct: -22, rightArmAbduct: -22, leftArmBend: 112, rightArmBend: 112 }), kf(1, { chestPitch: 10, headPitch: 18, leftArmPitch: -58, rightArmPitch: -58, leftArmAbduct: -22, rightArmAbduct: -22, leftArmBend: 114, rightArmBend: 114 })] },
    { id: "stomp_angry", name: "愤怒跺脚", category: "情绪与表演", durationSec: 1.6, keyframes: [kf(0, { chestPitch: 10, leftArmAbduct: 34, rightArmAbduct: 34, leftArmBend: 74, rightArmBend: 74, rightLegPitch: -54, rightLegBend: 78 }), kf(0.35, { chestPitch: 16, headPitch: 12, leftArmPitch: -24, rightArmPitch: -24, leftArmBend: 88, rightArmBend: 88, rightLegPitch: -4, rightLegBend: 12 }), kf(1, { chestPitch: 10, leftArmAbduct: 30, rightArmAbduct: 30, leftArmBend: 68, rightArmBend: 68 })] },
    { id: "cheer_win", name: "欢呼庆祝", category: "情绪与表演", durationSec: 2, keyframes: [kf(0, { chestPitch: -10, headPitch: -16, leftArmPitch: -150, rightArmPitch: -150, leftArmAbduct: 44, rightArmAbduct: 44, leftArmBend: 22, rightArmBend: 22 }), kf(0.5, { chestPitch: -14, headPitch: -20, leftArmPitch: -160, rightArmPitch: -160, leftArmAbduct: 58, rightArmAbduct: 58, leftArmBend: 44, rightArmBend: 44 }), kf(1, { chestPitch: -10, headPitch: -16, leftArmPitch: -150, rightArmPitch: -150, leftArmAbduct: 44, rightArmAbduct: 44, leftArmBend: 22, rightArmBend: 22 })] },
    { id: "shock_back", name: "震惊后退", category: "情绪与表演", durationSec: 1.8, keyframes: [kf(0, { bodyPitch: -14, chestPitch: -12, headPitch: -10, leftArmPitch: -68, rightArmPitch: -68, leftArmAbduct: 36, rightArmAbduct: 36, leftArmBend: 84, rightArmBend: 84, leftLegPitch: 20, rightLegPitch: -18 }), kf(1, { bodyPitch: -16, chestPitch: -14, leftArmPitch: -76, rightArmPitch: -76, leftArmAbduct: 42, rightArmAbduct: 42, leftArmBend: 92, rightArmBend: 92 })] },
    { id: "sad_slump", name: "沮丧低头", category: "情绪与表演", durationSec: 3, keyframes: [kf(0, { chestPitch: 24, headPitch: 32, leftArmPitch: 14, rightArmPitch: 14, leftArmBend: 18, rightArmBend: 18, leftLegBend: 8, rightLegBend: 8 }), kf(1, { chestPitch: 28, headPitch: 36, leftArmPitch: 16, rightArmPitch: 16 })] },

    // 动作与格斗
    { id: "fight_guard", name: "格斗架势", category: "动作与格斗", durationSec: 1.8, keyframes: [kf(0, { chestPitch: 14, chestYaw: -24, headYaw: 22, leftArmPitch: -64, rightArmPitch: -48, leftArmBend: 92, rightArmBend: 108, leftLegPitch: -24, rightLegPitch: 24, leftLegBend: 32, rightLegBend: 26 }), kf(0.5, { chestPitch: 16, chestYaw: -26, leftArmPitch: -70, rightArmPitch: -54, leftArmBend: 96, rightArmBend: 112, leftLegPitch: -26, rightLegPitch: 26, leftLegBend: 36, rightLegBend: 30 }), kf(1, { chestPitch: 14, chestYaw: -24, leftArmPitch: -64, rightArmPitch: -48, leftArmBend: 92, rightArmBend: 108, leftLegPitch: -24, rightLegPitch: 24, leftLegBend: 32, rightLegBend: 26 })] },
    { id: "punch_right", name: "右直拳出击", category: "动作与格斗", durationSec: 1.2, keyframes: [kf(0, { chestYaw: 20, leftArmPitch: -56, leftArmBend: 96, rightArmPitch: -24, rightArmBend: 112 }), kf(0.45, { chestPitch: 16, chestYaw: -32, headYaw: 28, leftArmPitch: -28, leftArmBend: 104, rightArmPitch: -94, rightArmBend: 8, leftLegPitch: -28, rightLegPitch: 28, leftLegBend: 36 }), kf(1, { chestYaw: -18, leftArmPitch: -58, leftArmBend: 92, rightArmPitch: -48, rightArmBend: 104 })] },
    { id: "kick_high", name: "高踢腿", category: "动作与格斗", durationSec: 1.4, keyframes: [kf(0, { chestPitch: 10, leftLegPitch: -18, rightLegPitch: 18 }), kf(0.5, { bodyPitch: -16, chestYaw: -20, leftArmPitch: -44, rightArmPitch: 38, leftArmBend: 72, rightArmBend: 62, rightLegPitch: -102, rightLegBend: 10, leftLegBend: 12 }), kf(1, { chestPitch: 10, leftLegPitch: -10, rightLegPitch: 10 })] },
    { id: "throw_ball", name: "挥臂投掷", category: "动作与格斗", durationSec: 1.5, keyframes: [kf(0, { chestYaw: 34, rightArmPitch: -140, rightArmAbduct: 46, rightArmBend: 64, leftArmPitch: -52, leftLegPitch: -24, rightLegPitch: 24 }), kf(0.5, { chestPitch: 22, chestYaw: -32, rightArmPitch: -32, rightArmBend: 14, leftArmPitch: 34, leftLegPitch: -34, rightLegPitch: 34 }), kf(1, { chestPitch: 8, rightArmPitch: 12 })] },
    { id: "sword_slash", name: "双手挥斩", category: "动作与格斗", durationSec: 1.6, keyframes: [kf(0, { chestPitch: -8, chestYaw: 38, leftArmPitch: -135, rightArmPitch: -140, leftArmBend: 48, rightArmBend: 42 }), kf(0.45, { chestPitch: 26, chestYaw: -38, leftArmPitch: -24, rightArmPitch: -28, leftArmBend: 24, rightArmBend: 22, leftLegPitch: -34, rightLegPitch: 34, leftLegBend: 42 }), kf(1, { chestPitch: 12, chestYaw: -22 })] },
    { id: "aim_shoot", name: "双手瞄准", category: "动作与格斗", durationSec: 2.2, keyframes: [kf(0, { chestPitch: 8, chestYaw: -18, headYaw: 18, leftArmPitch: -88, rightArmPitch: -88, leftArmAbduct: -16, rightArmAbduct: -16, leftArmBend: 18, rightArmBend: 14, leftLegPitch: -18, rightLegPitch: 18, leftLegBend: 18 }), kf(1, { chestPitch: 8, chestYaw: -18, headYaw: 18, leftArmPitch: -88, rightArmPitch: -88, leftArmAbduct: -16, rightArmAbduct: -16 })] },

    // 日常与工作
    { id: "phone_check", name: "低头看手机", category: "日常与工作", durationSec: 2.8, keyframes: [kf(0, { chestPitch: 10, headPitch: 28, leftArmPitch: -46, rightArmPitch: -46, leftArmAbduct: -12, rightArmAbduct: -12, leftArmBend: 96, rightArmBend: 96 }), kf(0.5, { chestPitch: 12, headPitch: 30, leftArmPitch: -48, rightArmPitch: -50, leftArmBend: 98, rightArmBend: 102 }), kf(1, { chestPitch: 10, headPitch: 28, leftArmPitch: -46, rightArmPitch: -46, leftArmBend: 96, rightArmBend: 96 })] },
    { id: "typing_desk", name: "坐姿打字", category: "日常与工作", durationSec: 2, keyframes: [kf(0, { chestPitch: 12, headPitch: 16, leftArmPitch: -46, rightArmPitch: -44, leftArmBend: 88, rightArmBend: 86, leftLegPitch: -88, rightLegPitch: -88, leftLegBend: 88, rightLegBend: 88 }), kf(0.5, { chestPitch: 14, headPitch: 18, leftArmPitch: -42, rightArmPitch: -48, leftArmBend: 84, rightArmBend: 90, leftLegPitch: -88, rightLegPitch: -88, leftLegBend: 88, rightLegBend: 88 }), kf(1, { chestPitch: 12, headPitch: 16, leftArmPitch: -46, rightArmPitch: -44, leftArmBend: 88, rightArmBend: 86, leftLegPitch: -88, rightLegPitch: -88, leftLegBend: 88, rightLegBend: 88 })] },
    { id: "push_heavy", name: "双手推物", category: "日常与工作", durationSec: 2, keyframes: [kf(0, { bodyPitch: 16, chestPitch: 22, leftArmPitch: -82, rightArmPitch: -82, leftArmBend: 24, rightArmBend: 24, leftLegPitch: -26, rightLegPitch: 34, leftLegBend: 34 }), kf(0.5, { bodyPitch: 20, chestPitch: 24, leftArmPitch: -86, rightArmPitch: -86, leftArmBend: 14, rightArmBend: 14, leftLegPitch: -30, rightLegPitch: 38, leftLegBend: 38 }), kf(1, { bodyPitch: 16, chestPitch: 22, leftArmPitch: -82, rightArmPitch: -82, leftArmBend: 24, rightArmBend: 24 })] },
    { id: "carry_box", name: "双手搬箱", category: "日常与工作", durationSec: 2, keyframes: [kf(0, { chestPitch: -6, leftArmPitch: -42, rightArmPitch: -42, leftArmAbduct: 12, rightArmAbduct: 12, leftArmBend: 88, rightArmBend: 88 }), kf(1, { chestPitch: -8, leftArmPitch: -44, rightArmPitch: -44, leftArmBend: 90, rightArmBend: 90 })] },
    { id: "reach_out", name: "前伸拿取", category: "日常与工作", durationSec: 2, keyframes: [kf(0, { chestPitch: 12, rightArmPitch: -86, rightArmBend: 14, leftLegPitch: -12, rightLegPitch: 12 }), kf(1, { chestPitch: 16, rightArmPitch: -96, rightArmBend: 10 })] },
    { id: "drink_cup", name: "举杯饮水", category: "日常与工作", durationSec: 2.5, keyframes: [kf(0, { rightArmPitch: -38, rightArmBend: 82 }), kf(0.5, { headPitch: -14, rightArmPitch: -82, rightArmAbduct: -14, rightArmBend: 126 }), kf(1, { rightArmPitch: -38, rightArmBend: 82 })] },
    { id: "dance_groove", name: "律动起舞", category: "日常与工作", durationSec: 1.8, keyframes: [kf(0, { chestRoll: -12, headRoll: 10, leftArmPitch: -74, rightArmPitch: -32, leftArmAbduct: 46, rightArmAbduct: 28, leftArmBend: 82, rightArmBend: 74, leftLegBend: 18, rightLegBend: 10 }), kf(0.5, { chestRoll: 12, headRoll: -10, leftArmPitch: -32, rightArmPitch: -74, leftArmAbduct: 28, rightArmAbduct: 46, leftArmBend: 74, rightArmBend: 82, leftLegBend: 10, rightLegBend: 18 }), kf(1, { chestRoll: -12, headRoll: 10, leftArmPitch: -74, rightArmPitch: -32, leftArmAbduct: 46, rightArmAbduct: 28, leftArmBend: 82, rightArmBend: 74 })] },
];

export function lerpJoints(a: PoseJoints25, b: PoseJoints25, alpha: number): PoseJoints25 {
    const na = normalizeJoints(a);
    const nb = normalizeJoints(b);
    const out: PoseJoints25 = {};
    for (const group of DIRECTOR_JOINT_GROUPS) {
        for (const s of group.sliders) {
            const va = Number(na[s.key] ?? 0);
            const vb = Number(nb[s.key] ?? 0);
            out[s.key] = Math.round((va + (vb - va) * alpha) * 10) / 10;
        }
    }
    return out;
}

export function sampleActionPose(action: { keyframes: Array<{ t: number; joints: PoseJoints25 }> }, normalizedT: number): PoseJoints25 {
    const frames = action.keyframes;
    if (!frames.length) return emptyJoints();
    const t = Math.max(0, Math.min(1, normalizedT));
    if (t <= frames[0].t) return normalizeJoints(frames[0].joints);
    if (t >= frames[frames.length - 1].t) return normalizeJoints(frames[frames.length - 1].joints);
    for (let i = 0; i < frames.length - 1; i++) {
        const cur = frames[i];
        const next = frames[i + 1];
        if (t >= cur.t && t <= next.t) {
            const span = Math.max(0.0001, next.t - cur.t);
            return lerpJoints(cur.joints, next.joints, (t - cur.t) / span);
        }
    }
    return normalizeJoints(frames[0].joints);
}

/** 根据文字描述合成自定义动作（文字生成动作） */
export function synthesizeActionFromText(name: string, description: string): DirectorCustomAction {
    const text = `${name} ${description}`;
    const start = emptyJoints();
    const mid: PoseJoints25 = { ...emptyJoints() };
    const end: PoseJoints25 = { ...emptyJoints() };

    if (/挥手|招手|打招呼/.test(text)) {
        Object.assign(mid, { rightArmPitch: -146, rightArmAbduct: 52, rightArmBend: 40, headYaw: 8, headRoll: 8 });
        Object.assign(end, { rightArmPitch: -18, rightArmAbduct: 12, rightArmBend: 14 });
    } else if (/抬.*右手|举.*右手|右手/.test(text)) {
        Object.assign(mid, { rightArmPitch: -145, rightArmAbduct: 24, rightArmBend: 20 });
    } else if (/抬.*左手|举.*左手|左手/.test(text)) {
        Object.assign(mid, { leftArmPitch: -145, leftArmAbduct: 24, leftArmBend: 20 });
    } else if (/双臂|双手|举手|欢呼/.test(text)) {
        Object.assign(mid, { leftArmPitch: -152, rightArmPitch: -152, leftArmAbduct: 42, rightArmAbduct: 42, leftArmBend: 24, rightArmBend: 24 });
    } else if (/鞠躬|弯腰/.test(text)) {
        Object.assign(mid, { chestPitch: 52, headPitch: 16 });
    } else if (/坐|蹲/.test(text)) {
        Object.assign(mid, { chestPitch: 18, leftLegPitch: -82, rightLegPitch: -82, leftLegBend: 96, rightLegBend: 96, leftArmPitch: -34, rightArmPitch: -34, leftArmBend: 66, rightArmBend: 66 });
    } else if (/转身|回头/.test(text)) {
        Object.assign(mid, { bodyYaw: 140, chestYaw: 30, headYaw: 28 });
        Object.assign(end, { bodyYaw: 180, chestYaw: 0, headYaw: 0 });
    } else if (/走|跑|冲/.test(text)) {
        Object.assign(mid, { chestPitch: 16, leftArmPitch: -54, rightArmPitch: 52, leftArmBend: 72, rightArmBend: 72, leftLegPitch: 46, rightLegPitch: -42, rightLegBend: 56 });
        Object.assign(end, { chestPitch: 16, leftArmPitch: 52, rightArmPitch: -54, leftArmBend: 72, rightArmBend: 72, leftLegPitch: -42, rightLegPitch: 46, leftLegBend: 56 });
    } else if (/拳|踢|打|格斗|攻击/.test(text)) {
        Object.assign(mid, { chestPitch: 16, chestYaw: -30, rightArmPitch: -96, rightArmBend: 8, leftArmPitch: -52, leftArmBend: 96, leftLegPitch: -26, rightLegPitch: 24, leftLegBend: 34 });
    } else {
        Object.assign(mid, { chestYaw: 14, headYaw: -10, leftArmPitch: -46, rightArmPitch: -62, leftArmBend: 76, rightArmBend: 58 });
    }

    return {
        id: `custom-act-${nanoid(6)}`,
        name: name.trim() || "自定义动作",
        source: "text",
        description,
        durationSec: 2.5,
        keyframes: [
            { t: 0, joints: start },
            { t: 0.5, joints: mid },
            { t: 1, joints: end },
        ],
        createdAt: Date.now(),
    };
}

/** 全部 14 种运镜预设（10 个固定注视点 + 4 个固定机位） */
export type CameraMotionPresetDef = {
    id: string;
    name: string;
    group: "fixed_target" | "fixed_camera";
    desc: string;
};

export const DIRECTOR_CAMERA_MOTIONS: CameraMotionPresetDef[] = [
    // 固定注视点 (10)
    { id: "dolly_in", name: "推近", group: "fixed_target", desc: "镜头沿光轴平稳推进至主体" },
    { id: "dolly_out", name: "拉远", group: "fixed_target", desc: "镜头平稳后移展现完整空间" },
    { id: "truck_side", name: "横移", group: "fixed_target", desc: "水平滑轨横向移动产生视差" },
    { id: "pedestal_up", name: "上升", group: "fixed_target", desc: "机位垂直平滑抬升开阔视野" },
    { id: "pedestal_down", name: "下降", group: "fixed_target", desc: "机位垂直下沉贴近低机位视角" },
    { id: "orbit_360", name: "环绕", group: "fixed_target", desc: "以注视点为圆心 360° 环绕运镜" },
    { id: "half_arc", name: "半弧", group: "fixed_target", desc: "180° 优雅半弧轨迹绕拍主体" },
    { id: "spiral_up", name: "螺旋上升", group: "fixed_target", desc: "边环绕边抬升展现宏大场景" },
    { id: "dolly_zoom", name: "滑动变焦", group: "fixed_target", desc: "希区柯克变焦，主体稳而背景拉伸" },
    { id: "dutch_roll", name: "倾斜镜头", group: "fixed_target", desc: "画面平稳倾斜营造戏剧张力" },
    // 固定机位 (4)
    { id: "pan_left", name: "镜头左摇", group: "fixed_camera", desc: "机位不动，注视点向左水平扫视" },
    { id: "pan_right", name: "镜头右摇", group: "fixed_camera", desc: "机位不动，注视点向右水平扫视" },
    { id: "tilt_up", name: "镜头上摇", group: "fixed_camera", desc: "机位不动，镜头平稳由下向上摇起" },
    { id: "tilt_down", name: "镜头下摇", group: "fixed_camera", desc: "机位不动，镜头平稳由上向下俯摇" },
];

/** 根据当前机位生成指定运镜预设的关键帧组 */
export function buildCameraMotionKeyframes(
    cam: DirectorCameraItem,
    motionId: string,
    startTime: number,
    duration: number,
): DirectorKeyframe[] {
    const [px, py, pz] = cam.position;
    const [tx, ty, tz] = cam.target;
    const dx = px - tx;
    const dy = py - ty;
    const dz = pz - tz;
    const radius = Math.max(1.2, Math.hypot(dx, dz));
    const baseAngle = Math.atan2(dx, dz);
    const out: DirectorKeyframe[] = [];
    const push = (tRatio: number, property: DirectorKeyframe["property"], value: DirectorKeyframe["value"]) => {
        out.push({
            id: nanoid(),
            time: Math.round((startTime + duration * tRatio) * 100) / 100,
            objectId: cam.id,
            property,
            value: Array.isArray(value) ? [Number(value[0].toFixed(2)), Number(value[1].toFixed(2)), Number(value[2].toFixed(2))] : Number(value.toFixed(1)),
        });
    };

    const steps = motionId === "orbit_360" || motionId === "spiral_up" ? 8 : motionId === "half_arc" ? 6 : 2;
    for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        switch (motionId) {
            case "dolly_in":
                push(u, "position", [tx + dx * (1 - u * 0.55), ty + dy * (1 - u * 0.35), tz + dz * (1 - u * 0.55)]);
                break;
            case "dolly_out":
                push(u, "position", [tx + dx * (1 + u * 0.75), ty + dy * (1 + u * 0.35), tz + dz * (1 + u * 0.75)]);
                break;
            case "truck_side": {
                const shift = (u - 0.5) * 4.4;
                push(u, "position", [px + Math.cos(baseAngle) * shift, py, pz - Math.sin(baseAngle) * shift]);
                break;
            }
            case "pedestal_up":
                push(u, "position", [px, py + u * 2.6, pz]);
                break;
            case "pedestal_down":
                push(u, "position", [px, Math.max(0.35, py - u * 1.6), pz]);
                break;
            case "orbit_360": {
                const ang = baseAngle + u * Math.PI * 2;
                push(u, "position", [tx + Math.sin(ang) * radius, py, tz + Math.cos(ang) * radius]);
                break;
            }
            case "half_arc": {
                const ang = baseAngle + u * Math.PI;
                push(u, "position", [tx + Math.sin(ang) * radius, py, tz + Math.cos(ang) * radius]);
                break;
            }
            case "spiral_up": {
                const ang = baseAngle + u * Math.PI * 2;
                const r = radius * (1 + u * 0.25);
                push(u, "position", [tx + Math.sin(ang) * r, py + u * 3.0, tz + Math.cos(ang) * r]);
                break;
            }
            case "dolly_zoom":
                push(u, "position", [tx + dx * (1 - u * 0.45), py, tz + dz * (1 - u * 0.45)]);
                push(u, "fov", Math.min(95, (cam.fov || 50) + u * 34));
                break;
            case "dutch_roll":
                push(u, "roll", (cam.roll || 0) + u * 22);
                break;
            case "pan_left": {
                const ang = Math.atan2(tx - px, tz - pz) + u * 0.75;
                const dist = Math.max(1.5, Math.hypot(tx - px, tz - pz));
                push(u, "target", [px + Math.sin(ang) * dist, ty, pz + Math.cos(ang) * dist]);
                break;
            }
            case "pan_right": {
                const ang = Math.atan2(tx - px, tz - pz) - u * 0.75;
                const dist = Math.max(1.5, Math.hypot(tx - px, tz - pz));
                push(u, "target", [px + Math.sin(ang) * dist, ty, pz + Math.cos(ang) * dist]);
                break;
            }
            case "tilt_up":
                push(u, "target", [tx, ty + u * 2.2, tz]);
                break;
            case "tilt_down":
                push(u, "target", [tx, Math.max(0.1, ty - u * 1.4), tz]);
                break;
        }
    }
    return out;
}

export function defaultTimelineState(): DirectorTimelineState {
    return {
        fps: 30,
        duration: 20,
        loop: true,
        hideEmptyTracks: false,
        keyframes: [],
        actionClips: [],
        storyboardCuts: [],
    };
}

export function defaultDirectorState(): DirectorStageState {
    const camId = "cam-main";
    return {
        mode: "static",
        aspectRatio: "16:9",
        scenePrompt: "",
        skyColor: "#171717",
        backgroundKind: "none",
        showLabels: true,
        gridSnap: false,
        viewSettings: { ...DEFAULT_VIEW_SETTINGS },
        environment: structuredClone(DIRECTOR_ENVIRONMENT_PRESETS.studio.env),
        characters: [
            {
                id: "char-a",
                name: "男性 · 标准",
                bodyType: "male_standard",
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
                color: "#a07d8b",
                defaultColor: "#a07d8b",
                opacity: 100,
                visible: true,
                locked: false,
                pose: "自然站立",
                poseActionId: "stand_idle",
                poseFrame: 0,
                joints: emptyJoints(),
                autoFacePath: true,
            },
        ],
        props: [],
        cameras: [
            {
                id: camId,
                name: "机位",
                position: [0, 2.2, 7],
                target: [0, 1, 0],
                fov: 50,
                roll: 0,
                aspectRatio: "16:9",
                showTarget: true,
                lockTarget: false,
                locked: false,
            } satisfies DirectorCameraItem,
        ],
        activeCameraId: camId,
        pipCameraId: camId,
        timeline: defaultTimelineState(),
        backgrounds: [],
        customAssets: [],
        customActions: [],
        revisions: [],
        snapshots: [],
    };
}

/** 底部「导演 Agent」中文自然语言快捷搭景引擎 */
export function applyDirectorAgentPrompt(
    state: DirectorStageState,
    prompt: string,
): { next: DirectorStageState; summary: string } {
    const text = prompt.trim();
    if (!text) return { next: state, summary: "" };
    const next: DirectorStageState = {
        ...state,
        scenePrompt: text,
        characters: [...state.characters],
        props: [...(state.props || [])],
        cameras: [...state.cameras],
        environment: structuredClone(state.environment || DIRECTOR_ENVIRONMENT_PRESETS.studio.env),
        timeline: {
            ...(state.timeline || defaultTimelineState()),
            keyframes: [...(state.timeline?.keyframes || [])],
            actionClips: [...(state.timeline?.actionClips || [])],
            storyboardCuts: [...(state.timeline?.storyboardCuts || [])],
        },
    };
    const notes: string[] = [];

    // 1. 环境灯光识别
    if (/夕阳|黄昏|日落|暖色/.test(text)) {
        next.environment = structuredClone(DIRECTOR_ENVIRONMENT_PRESETS.sunset.env);
        next.skyColor = next.environment.backgroundColor;
        notes.push("环境切换为「暖色夕阳」");
    } else if (/夜景|蓝调|夜晚|赛博|暗夜/.test(text)) {
        next.environment = structuredClone(DIRECTOR_ENVIRONMENT_PRESETS.night.env);
        next.skyColor = next.environment.backgroundColor;
        notes.push("环境切换为「蓝调夜景」");
    } else if (/日光|白天|阳光|自然光/.test(text)) {
        next.environment = structuredClone(DIRECTOR_ENVIRONMENT_PRESETS.daylight.env);
        next.skyColor = next.environment.backgroundColor;
        notes.push("环境切换为「柔和日光」");
    } else if (/影棚|棚拍/.test(text)) {
        next.environment = structuredClone(DIRECTOR_ENVIRONMENT_PRESETS.studio.env);
        next.skyColor = next.environment.backgroundColor;
        notes.push("环境切换为「影棚」");
    }

    // 2. 角色数量与站位识别
    if (/两个|两人|双人|对峙|面对面|交谈/.test(text) && next.characters.length < 2) {
        const preset = /女/.test(text) ? DIRECTOR_CHARACTER_PRESETS[1] : DIRECTOR_CHARACTER_PRESETS[0];
        if (next.characters[0]) {
            next.characters[0] = { ...next.characters[0], position: [-1.1, 0, 0], rotation: [0, 82, 0] };
        }
        next.characters.push({
            id: nanoid(),
            name: preset.label,
            bodyType: preset.value,
            position: [1.1, 0, 0],
            rotation: [0, -82, 0],
            scale: [1, 1, 1],
            color: preset.defaultColor,
            defaultColor: preset.defaultColor,
            opacity: 100,
            visible: true,
            pose: "交谈手势",
            poseActionId: "talk_gesture",
            joints: sampleActionPose(DIRECTOR_ACTION_PRESETS.find((a) => a.id === "talk_gesture")!, 0.3),
            autoFacePath: true,
        });
        notes.push("已布置双人面对面站位");
    } else if (/添加.*女|女角色|女性/.test(text) && !next.characters.some((c) => c.bodyType.startsWith("female"))) {
        const p = DIRECTOR_CHARACTER_PRESETS[1];
        next.characters.push({
            id: nanoid(),
            name: p.label,
            bodyType: p.value,
            position: [1.2, 0, 0],
            rotation: [0, -15, 0],
            scale: [1, 1, 1],
            color: p.defaultColor,
            defaultColor: p.defaultColor,
            opacity: 100,
            visible: true,
            pose: "自然站立",
            joints: emptyJoints(),
            autoFacePath: true,
        });
        notes.push("已添加女性角色");
    }

    // 3. 动作/姿势匹配
    for (const act of DIRECTOR_ACTION_PRESETS) {
        const key = act.name.slice(0, 2);
        if (text.includes(act.name) || (key.length === 2 && text.includes(key))) {
            if (next.characters[0]) {
                next.characters[0] = {
                    ...next.characters[0],
                    pose: act.name,
                    poseActionId: act.id,
                    joints: sampleActionPose(act, 0.35),
                };
                if (next.mode === "dynamic" && next.timeline) {
                    next.timeline.actionClips.push({
                        id: nanoid(),
                        characterId: next.characters[0].id,
                        actionId: act.id,
                        actionName: act.name,
                        mode: "action",
                        startTime: 0,
                        duration: Math.max(2, act.durationSec * 2),
                    });
                }
                notes.push(`角色姿势设为「${act.name}」`);
            }
            break;
        }
    }

    // 4. 物体/布景关键词匹配（支持一次识别多个物体）
    let propOffset = 0;
    for (const preset of ALL_PROP_PRESETS) {
        if (text.includes(preset.name)) {
            const x = propOffset === 0 ? 0 : (propOffset % 2 === 1 ? -1.8 : 1.8);
            const z = preset.category === "建筑" ? -2.6 : -1.2 - Math.floor(propOffset / 2) * 0.9;
            const item: DirectorPropItem = {
                id: nanoid(),
                name: `${preset.name} ${(next.props?.length || 0) + 1}`,
                presetId: preset.id,
                category: preset.category,
                baseHeight: preset.height,
                dimensions: [...preset.dimensions],
                position: [x, 0, z],
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
                color: preset.color,
                defaultColor: preset.color,
                opacity: 100,
                visible: true,
                locked: false,
            };
            next.props!.push(item);
            propOffset++;
            notes.push(`放置「${preset.name}」`);
            if (propOffset >= 4) break;
        }
    }

    // 5. 运镜关键词匹配
    for (const m of DIRECTOR_CAMERA_MOTIONS) {
        if (text.includes(m.name)) {
            const cam = next.cameras.find((c) => c.id === next.activeCameraId) || next.cameras[0];
            if (cam && next.timeline) {
                const kfs = buildCameraMotionKeyframes(cam, m.id, 0, 5);
                next.timeline.keyframes = [
                    ...next.timeline.keyframes.filter((k) => k.objectId !== cam.id),
                    ...kfs,
                ];
                next.mode = "dynamic";
                notes.push(`已为「${cam.name}」生成「${m.name}」运镜并切入动态预演`);
            }
            break;
        }
    }

    // 6. 机位构图预设匹配
    for (const cp of DIRECTOR_CAMERA_PRESETS) {
        if (cp.id !== "current" && text.includes(cp.name)) {
            const focus = next.characters[0]?.position || [0, 0, 0];
            const newCam: DirectorCameraItem = {
                id: nanoid(),
                name: `机位${next.cameras.length + 1} · ${cp.name}`,
                position: [focus[0] + cp.offset[0], focus[1] + cp.offset[1], focus[2] + cp.offset[2]],
                target: [focus[0] + cp.targetOffset[0], focus[1] + cp.targetOffset[1], focus[2] + cp.targetOffset[2]],
                fov: cp.fov,
                roll: cp.roll || 0,
                aspectRatio: next.aspectRatio,
                showTarget: true,
                lockTarget: false,
            };
            next.cameras.push(newCam);
            next.activeCameraId = newCam.id;
            next.pipCameraId = newCam.id;
            notes.push(`新增机位「${cp.name}」`);
            break;
        }
    }

    return {
        next,
        summary: notes.length ? notes.join(" · ") : "已记录导演场记描述（试试提到：夕阳/夜景、双人交谈、沙发/树/轿车、推近/环绕、过肩镜头/低角度仰拍）",
    };
}
