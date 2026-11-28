export type VideoMovementPreset = {
    id: number;
    name: string;
    category: "推拉变焦" | "摇移升降" | "环绕跟拍" | "特种视角";
    prompt: string;
    media: string;
};

export type VideoCharacterSheetKey = "full_body" | "face_closeup" | "expression_grid" | "character_sheet";

export type VideoCharacterPreset = {
    id: string;
    name: string;
    category: string;
};

export type VideoPromptPreset = {
    id: string;
    title: string;
    category: string;
    content: string;
    custom?: boolean;
};

export const CHARACTER_SHEET_LABELS: Record<VideoCharacterSheetKey, string> = {
    full_body: "人物全身图",
    face_closeup: "面部特写",
    expression_grid: "表情九宫格",
    character_sheet: "人物看板",
};

export const characterSheetUrl = (id: string, key: VideoCharacterSheetKey) => `/presets/video/characters/${id}_${key}.webp`;

export const VIDEO_QUICK_CAMERA_CHIPS = [
    { label: "缓慢推镜", prompt: "镜头缓慢向前推进，焦点集中在主体细节" },
    { label: "平滑环绕", prompt: "镜头围绕主体平滑环绕拍摄，展现立体空间感" },
    { label: "跟随拍摄", prompt: "镜头平稳跟随主体移动，保持主体在画面中心" },
    { label: "微微上摇", prompt: "镜头由下向上缓慢摇摄，展现环境层次与高度感" },
    { label: "固定机位", prompt: "固定机位稳定拍摄，主体在画面中自然运动" },
    { label: "柯克变焦", prompt: "希区柯克式变焦推拉，主体大小不变而背景空间剧烈压缩拉伸" },
] as const;

export const VIDEO_MOVEMENTS: VideoMovementPreset[] = [
    { id: 1, name: "固定镜头", category: "摇移升降", prompt: "固定机位镜头，机位完全稳定不晃动，主体在画框内自然运动", media: "/presets/video/movements/1.mp4" },
    { id: 2, name: "跟随拍摄", category: "环绕跟拍", prompt: "流畅跟随拍摄，镜头紧跟主体运动轨迹同步移动", media: "/presets/video/movements/2.mp4" },
    { id: 3, name: "盘旋抬升", category: "环绕跟拍", prompt: "镜头围绕主体螺旋盘旋并持续抬升，逐渐展现宏大场景", media: "/presets/video/movements/3.mp4" },
    { id: 4, name: "盘旋下降", category: "环绕跟拍", prompt: "镜头自高处盘旋下降并逐步聚焦到画面主体", media: "/presets/video/movements/4.mp4" },
    { id: 5, name: "镜头上摇", category: "摇移升降", prompt: "机位固定，镜头平滑向上摇摄（Tilt Up），由局部过渡至上方景物", media: "/presets/video/movements/5.mp4" },
    { id: 6, name: "镜头下摇", category: "摇移升降", prompt: "机位固定，镜头平滑向下摇摄（Tilt Down），自上而下揭示主体", media: "/presets/video/movements/6.mp4" },
    { id: 7, name: "镜头左摇", category: "摇移升降", prompt: "机位固定，镜头平滑向左水平摇摄（Pan Left）", media: "/presets/video/movements/7.mp4" },
    { id: 8, name: "镜头右摇", category: "摇移升降", prompt: "机位固定，镜头平滑向右水平摇摄（Pan Right）", media: "/presets/video/movements/8.mp4" },
    { id: 9, name: "镜头上升", category: "摇移升降", prompt: "机位垂直平稳上升（Pedestal Up），视野逐渐开阔", media: "/presets/video/movements/9.mp4" },
    { id: 10, name: "镜头下降", category: "摇移升降", prompt: "机位垂直平稳下降（Pedestal Down），重心下沉贴近地面视角", media: "/presets/video/movements/10.mp4" },
    { id: 11, name: "镜头左移", category: "摇移升降", prompt: "机位沿水平滑轨向左平移（Truck Left），产生明显前景视差", media: "/presets/video/movements/11.mp4" },
    { id: 12, name: "镜头右移", category: "摇移升降", prompt: "机位沿水平滑轨向右平移（Truck Right），展现横向空间纵深", media: "/presets/video/movements/12.mp4" },
    { id: 13, name: "镜头前推", category: "推拉变焦", prompt: "机位平稳向前推进（Dolly In），逐步拉近主体并增强情绪张力", media: "/presets/video/movements/13.mp4" },
    { id: 14, name: "镜头后移", category: "推拉变焦", prompt: "机位平稳向后拉远（Dolly Out），逐步交代主体所处的完整环境", media: "/presets/video/movements/14.mp4" },
    { id: 15, name: "变焦推进", category: "推拉变焦", prompt: "镜头光学变焦推进（Zoom In），快速收紧构图至核心特写", media: "/presets/video/movements/15.mp4" },
    { id: 16, name: "变焦拉远", category: "推拉变焦", prompt: "镜头光学变焦拉远（Zoom Out），从局部细节迅速扩展为全景", media: "/presets/video/movements/16.mp4" },
    { id: 17, name: "柯克变焦", category: "推拉变焦", prompt: "希区柯克变焦（Dolly Zoom），主体保持比例而背景空间强烈拉伸压缩", media: "/presets/video/movements/17.mp4" },
    { id: 18, name: "环绕拍摄", category: "环绕跟拍", prompt: "镜头以主体为圆心平滑 360° 环绕运镜（Orbit Shot）", media: "/presets/video/movements/18.mp4" },
    { id: 19, name: "滚筒旋转", category: "特种视角", prompt: "镜头沿光轴顺时针平稳滚筒旋转（Roll Shot），营造失重与戏剧冲击", media: "/presets/video/movements/19.mp4" },
    { id: 20, name: "第一视角", category: "特种视角", prompt: "沉浸式第一人称视角（FPV/POV），随角色视线自然前进与探索", media: "/presets/video/movements/20.mp4" },
    { id: 21, name: "无人机", category: "特种视角", prompt: "无人机动态穿越飞行镜头，大范围流畅俯冲与掠过场景", media: "/presets/video/movements/21.mp4" },
    { id: 22, name: "高空航拍", category: "特种视角", prompt: "高空俯视航拍广角镜头，平稳推进展示宏大地形与建筑布局", media: "/presets/video/movements/22.mp4" },
    { id: 23, name: "手持拍摄", category: "特种视角", prompt: "写实电影感手持微晃拍摄（Handheld），增强临场纪实氛围", media: "/presets/video/movements/23.mp4" },
];

export const VIDEO_CHARACTERS: VideoCharacterPreset[] = [
    { id: "01", name: "清冷仙侠", category: "古风仙侠" },
    { id: "02", name: "逍遥公子", category: "古风仙侠" },
    { id: "03", name: "暗黑权贵", category: "古风仙侠" },
    { id: "04", name: "世家嫡女", category: "古风仙侠" },
    { id: "05", name: "冷峻女帝", category: "古风仙侠" },
    { id: "06", name: "深宫宠妃", category: "古风仙侠" },
    { id: "07", name: "时尚男模", category: "时尚新中式" },
    { id: "08", name: "时尚女模", category: "时尚新中式" },
    { id: "09", name: "新中式男模", category: "时尚新中式" },
    { id: "10", name: "新中式女模", category: "时尚新中式" },
    { id: "11", name: "初恋甜妹", category: "青春韩系" },
    { id: "12", name: "元气甜妹", category: "青春韩系" },
    { id: "13", name: "美剧男主", category: "青春韩系" },
    { id: "14", name: "美剧女主", category: "青春韩系" },
    { id: "15", name: "韩系青春男", category: "青春韩系" },
    { id: "16", name: "韩系青春女", category: "青春韩系" },
    { id: "17", name: "韩系职场男", category: "青春韩系" },
    { id: "18", name: "韩系职场女", category: "青春韩系" },
    { id: "19", name: "韩系复古男", category: "青春韩系" },
    { id: "20", name: "韩系复古女", category: "青春韩系" },
    { id: "21", name: "超现实怪诞", category: "先锋怪诞" },
    { id: "22", name: "时尚怪诞", category: "先锋怪诞" },
    { id: "23", name: "滑稽怪诞 A", category: "先锋怪诞" },
    { id: "24", name: "前卫怪诞", category: "先锋怪诞" },
    { id: "25", name: "滑稽怪诞 B", category: "先锋怪诞" },
    { id: "26", name: "牛魔王", category: "中式妖怪" },
    { id: "27", name: "马面将军", category: "中式妖怪" },
    { id: "28", name: "蛙太守", category: "中式妖怪" },
    { id: "29", name: "猪员外", category: "中式妖怪" },
    { id: "30", name: "鹰王", category: "中式妖怪" },
    { id: "31", name: "狐三娘", category: "中式妖怪" },
    { id: "32", name: "貔貅", category: "中式妖怪" },
    { id: "33", name: "少年主角", category: "动漫动画" },
    { id: "34", name: "游泳少女", category: "动漫动画" },
    { id: "35", name: "乡间少女", category: "动漫动画" },
    { id: "36", name: "冒险少年", category: "动漫动画" },
    { id: "37", name: "动画小男孩", category: "动漫动画" },
    { id: "38", name: "动画老爷爷", category: "动漫动画" },
    { id: "39", name: "国漫少女", category: "动漫动画" },
    { id: "40", name: "国漫少年", category: "动漫动画" },
    { id: "41", name: "乡土少年", category: "电影质感" },
    { id: "42", name: "小镇女孩", category: "电影质感" },
    { id: "43", name: "都市职场男", category: "电影质感" },
    { id: "44", name: "都市职场女", category: "电影质感" },
    { id: "45", name: "复古港片男主", category: "电影质感" },
    { id: "46", name: "复古港片女主", category: "电影质感" },
    { id: "47", name: "亚洲少年感", category: "电影质感" },
    { id: "48", name: "欧美少年感", category: "电影质感" },
];

export const VIDEO_OFFICIAL_PROMPTS: VideoPromptPreset[] = [
    {
        id: "p-0",
        title: "人物/动物四视图",
        category: "角色控制",
        content:
            "角色设定参考图，四视图设定稿，同一角色，四个分镜版面清晰分隔：\n\n第一格：脸部特写，清晰五官，精致面部细节；\n第二格：正面全身，自然站立，双臂自然下垂，面部做模糊化处理，不保留可辨识五官；\n第三格：侧面全身，自然站立，身体比例准确，面部做模糊化处理，不保留可辨识五官；\n第四格：背面全身，自然站立，展示发型和背部服装。\n\n所有版面为同一人物，发型一致，身材比例一致，服装一致；第二、三格仅遮挡面部，其余身体、发型、服装保持与特写格统一。纯白背景，写实摄影，柔和棚拍光，清晰锐利，干净抠图效果，无杂乱阴影，无文字。",
    },
    { id: "p-1", title: "真实物理运动", category: "视频质感", content: "人物动作符合真实重力与惯性，保持正常实时运动节奏，不要刻意慢动作；发丝、衣摆与布料随微风及身体动作自然摆动，肢体与物体接触关系真实不穿模。" },
    { id: "p-2", title: "白模导演台构图参考", category: "导演台", content: "参考三维白模图中的机位角度、构图比例、空间纵深与角色站位关系，按真实写实光影与材质重新演绎画面，不保留白模几何质感。" },
    { id: "p-3", title: "画质降噪与纯净光影", category: "画质控制", content: "整体画面通透干净，呈现自然柔和的电影级光影层次与清晰材质细节，避免杂乱噪点、过多胶片颗粒和涂抹感。" },
    { id: "p-4", title: "影调与氛围参考", category: "色彩光影", content: "仅提取参考图的整体色调、光影对比与情绪氛围，不照搬原图构图与主体内容，统一全片色彩逻辑。" },
    { id: "p-5", title: "产品精准还原", category: "商业电商", content: "严格保留参考图中产品的轮廓比例、材质反光、配色、标识与包装细节，镜头平稳环绕或微推展示高级商业质感。" },
    { id: "p-6", title: "角色换装保持身份", category: "角色控制", content: "保持主体人物的面部五官、发型、神态与体型完全一致，将服装替换为参考图所示款式，还原面料垂坠感与缝线细节。" },
    { id: "p-7", title: "多角色特征独立", category: "角色控制", content: "画面中的每位角色外貌、发型、衣着均严格对应各自描述，互不混淆撞脸，各自保持清晰独立的表情与互动视线。" },
    { id: "p-8", title: "真实皮肤纹理（去塑料感）", category: "人像质感", content: "人物皮肤保留自然细腻毛孔、真实肤色过渡与柔和受光，拒绝过度磨皮、蜡像感与塑料建模脸。" },
    { id: "p-9", title: "手部与肢体解剖自然", category: "画质控制", content: "人物双手五指结构清晰自然、比例协调，关节弯折符合真实解剖学逻辑，动作舒展连贯。" },
    { id: "p-10", title: "空间透视与比例统一", category: "构图镜头", content: "所有前景、中景、远景物体遵循同一套镜头焦段与消失点透视关系，近大远小自然协调，无空间畸变。" },
    { id: "p-11", title: "光影方向一致", category: "色彩光影", content: "画面具备明确统一的主光源方向，人物、道具与场景的受光面、暗部和地面投影方向完全吻合。" },
    { id: "p-12", title: "景别推进至特写", category: "构图镜头", content: "镜头从当前景别平稳推进收紧构图至面部或主体特写，过程中主体身份、服装与背景结构保持连贯不变。" },
    { id: "p-13", title: "深度运动节奏参考", category: "视频质感", content: "参考输入的深度与空间运动节奏，保留主体站位、遮挡层次与运镜轨迹，赋予全新的写实材质与光照。" },
    { id: "p-14", title: "局部修改其余不变", category: "编辑控制", content: "仅按提示词修改目标局部元素，其余区域的构图、人物身份、背景建筑、光影色调保持完全稳定。" },
    { id: "p-15", title: "画面文字精准呈现", category: "商业电商", content: "画面中仅呈现指定引号内的文字内容，笔画工整清晰、排版合理，不产生乱码或多余水印。" },
    { id: "p-16", title: "纯音乐氛围配乐", category: "声音音效", content: "伴随柔和纯音乐氛围配乐与自然环境白噪音，无人声对白，节奏与镜头运镜起伏同步收束。" },
    { id: "p-17", title: "通用负面约束", category: "画质控制", content: "避免低分辨率、画面模糊、五官漂移变形、手指残缺多余、闪烁撕裂、多余水印与文字乱码。" },
    { id: "p-18", title: "角色外貌设定锁定", category: "角色控制", content: "延续同一角色的发型、五官特征、服装细节与标志性配饰，确保跨镜头切换时角色外观高度一致。" },
];

const CUSTOM_PROMPTS_KEY = "blinkflow:video-custom-prompts";
const RECENT_PROMPTS_KEY = "blinkflow:video-recent-prompts";
const FAVORITE_MOVEMENTS_KEY = "blinkflow:video-favorite-movements";

export function readCustomVideoPrompts(): VideoPromptPreset[] {
    try {
        const list = JSON.parse(localStorage.getItem(CUSTOM_PROMPTS_KEY) || "[]");
        return Array.isArray(list) ? list.filter((x) => typeof x?.id === "string" && typeof x?.title === "string" && typeof x?.content === "string") : [];
    } catch { return []; }
}

export function saveCustomVideoPrompts(items: VideoPromptPreset[]) {
    try { localStorage.setItem(CUSTOM_PROMPTS_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

export function readRecentVideoPromptIds(): string[] {
    try {
        const list = JSON.parse(localStorage.getItem(RECENT_PROMPTS_KEY) || "[]");
        return Array.isArray(list) ? list.filter((x) => typeof x === "string").slice(0, 20) : [];
    } catch { return []; }
}

export function pushRecentVideoPromptId(id: string): string[] {
    const next = [id, ...readRecentVideoPromptIds().filter((item) => item !== id)].slice(0, 20);
    try { localStorage.setItem(RECENT_PROMPTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
}

export function readFavoriteMovementIds(): number[] {
    try {
        const list = JSON.parse(localStorage.getItem(FAVORITE_MOVEMENTS_KEY) || "[]");
        return Array.isArray(list) ? list.filter((x) => typeof x === "number") : [];
    } catch { return []; }
}

export function toggleFavoriteMovementId(id: number): number[] {
    const current = readFavoriteMovementIds();
    const next = current.includes(id) ? current.filter((x) => x !== id) : [id, ...current];
    try { localStorage.setItem(FAVORITE_MOVEMENTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
}
