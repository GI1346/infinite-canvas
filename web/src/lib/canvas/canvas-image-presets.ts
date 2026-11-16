/** 图片节点「相机 / 配色 / 风格」三组预设，结构和文案对齐即梦画布。 */

export type CameraOption = { value: string; prompt: string; photo?: string };
export type CameraSection = { key: string; label: string; options: CameraOption[] };
export type ColorPreset = { value: string; photo?: string; prompt: string; colors: string[] };

const AUTO: CameraOption = { value: "自动", prompt: "" };

/** 相机：四列，每列都有「自动」。 */
export const cameraSections: CameraSection[] = [
    {
        key: "body",
        label: "相机",
        options: [
            { value: "自动", prompt: "", photo: "/presets/camera/body-auto.png" },
            { value: "黑白纪实", prompt: "黑白纪实摄影，颗粒明显，高反差", photo: "/presets/camera/body-bw.png" },
            { value: "Y2K卡片机", prompt: "Y2K 卡片机质感，轻度过曝与数码噪点", photo: "/presets/camera/body-y2k.png" },
            { value: "现代数字", prompt: "现代数码相机质感，画面干净锐利", photo: "/presets/camera/body-modern.png" },
            { value: "电影胶片", prompt: "电影胶片质感，色彩柔和，细腻颗粒", photo: "/presets/camera/body-film.png" },
        ],
    },
    {
        key: "lens",
        label: "镜头",
        options: [
            { value: "自动", prompt: "", photo: "/presets/camera/lens-auto.png" },
            { value: "鱼眼广角镜头", prompt: "鱼眼广角镜头，明显桶形畸变", photo: "/presets/camera/lens-fisheye.png" },
            { value: "漏光镜头", prompt: "镜头漏光，边缘彩色光晕", photo: "/presets/camera/lens-leak.png" },
            { value: "干净锐利镜头", prompt: "干净锐利的镜头，边缘清晰", photo: "/presets/camera/lens-sharp.png" },
            { value: "银幕电影镜头", prompt: "银幕电影镜头，宽银幕构图", photo: "/presets/camera/lens-cinema.png" },
        ],
    },
    {
        key: "focal",
        label: "焦距",
        options: [
            { value: "自动", prompt: "", photo: "/presets/camera/focal-auto.png" },
            { value: "24mm", prompt: "24mm 广角，透视夸张" },
            { value: "35mm", prompt: "35mm 人文视角，自然透视" },
            { value: "85mm", prompt: "85mm 中长焦，人像压缩感与浅景深" },
            { value: "135mm", prompt: "135mm 长焦，强压缩感与背景虚化" },
        ],
    },
    {
        key: "aperture",
        label: "光圈",
        options: [
            { value: "自动", prompt: "", photo: "/presets/camera/aperture-auto.png" },
            { value: "f1.4浅景深", prompt: "f1.4 大光圈，极浅景深，背景奶油虚化", photo: "/presets/camera/aperture-f14.png" },
            { value: "f4中景深", prompt: "f4 光圈，中等景深", photo: "/presets/camera/aperture-f4.png" },
            { value: "f11深景深", prompt: "f11 小光圈，深景深，前后都清晰", photo: "/presets/camera/aperture-f11.png" },
        ],
    },
];

/** 配色：每项给 5 个代表色，用来画色点和缩略图底色。 */
// 配色：图片与名称取自即梦同款（27 个色调），色点从对应图片里提取。
export const colorPresets: ColorPreset[] = [
    { value: "复古糖果色调", photo: "/presets/colors/01.webp", prompt: "复古糖果色调，粉黄撞色", colors: ["#e8aeb2", "#8d6a76", "#947389", "#e6b197", "#f3cba8"] },
    { value: "日系清新色调", photo: "/presets/colors/02.webp", prompt: "日系清新色调，低饱和，明亮通透", colors: ["#eaedf9", "#d0d3e8", "#6b6c77", "#38374a", "#494a57"] },
    { value: "雾蓝米白色调", photo: "/presets/colors/03.webp", prompt: "雾蓝与米白色调，柔和灰调", colors: ["#cde4fa", "#6f7347", "#b4d5f2", "#656b3b", "#535430"] },
    { value: "暖黄灰褐色调", photo: "/presets/colors/04.webp", prompt: "暖黄灰褐色调，怀旧柔和", colors: ["#e1e3c9", "#afb390", "#d4c994", "#d0cfa9", "#929372"] },
    { value: "冷青琥珀色调", photo: "/presets/colors/05.webp", prompt: "冷青与琥珀撞色，冷暖对比", colors: ["#f1f2c9", "#4b9369", "#8bb1a9", "#dbe5c4", "#ba8c54"] },
    { value: "南法假日色调", photo: "/presets/colors/06.webp", prompt: "南法假日色调，阳光暖调", colors: ["#2b1609", "#170c05", "#362810", "#fbac55", "#4a2e15"] },
    { value: "沙漠史诗色调", photo: "/presets/colors/07.webp", prompt: "沙漠史诗色调，土黄与深棕", colors: ["#b46f37", "#b1975d", "#6d4930", "#ccb26e", "#ae9663"] },
    { value: "复古好莱坞色调", photo: "/presets/colors/08.webp", prompt: "复古好莱坞色调，暖金质感", colors: ["#160b05", "#291105", "#522f07", "#fefad1", "#683806"] },
    { value: "幻彩史诗色调", photo: "/presets/colors/09.webp", prompt: "幻彩史诗色调，高饱和渐变", colors: ["#b27710", "#ca8a16", "#8d580e", "#291113", "#181012"] },
    { value: "过期暖黄色调", photo: "/presets/colors/10.webp", prompt: "过期胶片暖黄色调，轻微偏色", colors: ["#151509", "#251c08", "#af8c35", "#172818", "#2e2b10"] },
    { value: "琥珀棕褐色调", photo: "/presets/colors/11.webp", prompt: "琥珀棕褐色调，温暖厚重", colors: ["#1a0b06", "#271408", "#4d2e15", "#714d28", "#392512"] },
    { value: "法式红绿色调", photo: "/presets/colors/12.webp", prompt: "法式红绿色调，复古优雅", colors: ["#b3ad78", "#6e502f", "#2c0603", "#8c7348", "#0b0f05"] },
    { value: "墨绿暖黄色调", photo: "/presets/colors/13.webp", prompt: "墨绿与暖黄搭配，复古温暖", colors: ["#173416", "#2b2b11", "#141204", "#6e744b", "#b2d1ad"] },
    { value: "灰绿砖红色调", photo: "/presets/colors/14.webp", prompt: "灰绿与砖红撞色", colors: ["#677257", "#5a664d", "#4e5a44", "#cbd8b7", "#45503c"] },
    { value: "韩系冷青色调", photo: "/presets/colors/15.webp", prompt: "韩系冷青色调，干净通透", colors: ["#bacdc8", "#c1d0cb", "#b2c5bb", "#2b3331", "#68776b"] },
    { value: "赛博冷绿色调", photo: "/presets/colors/16.webp", prompt: "赛博冷绿色调，霓虹感", colors: ["#344c09", "#061605", "#152b06", "#536818", "#45590c"] },
    { value: "灰蓝海岸色调", photo: "/presets/colors/17.webp", prompt: "灰蓝海岸色调，清冷克制", colors: ["#10160c", "#292a16", "#333825", "#044850", "#677057"] },
    { value: "米黄天蓝色调", photo: "/presets/colors/18.webp", prompt: "米黄与天蓝搭配，清新通透", colors: ["#0a4f4e", "#0d2d2e", "#0b1616", "#cad7a9", "#b5c89a"] },
    { value: "青橙色调", photo: "/presets/colors/19.webp", prompt: "青橙色调，强冷暖对比", colors: ["#071616", "#0c2e2f", "#90b4b1", "#134d4a", "#2a524c"] },
    { value: "港片霓虹色调", photo: "/presets/colors/20.webp", prompt: "港片霓虹色调，红蓝霓虹", colors: ["#131814", "#2b2e2a", "#2b271a", "#192c2a", "#172816"] },
    { value: "孔雀蓝色调", photo: "/presets/colors/21.webp", prompt: "孔雀蓝色调，浓郁冷艳", colors: ["#05132c", "#03081b", "#122a4b", "#10223c", "#2c354b"] },
    { value: "单色蓝色调", photo: "/presets/colors/22.webp", prompt: "单色蓝色调，统一冷蓝", colors: ["#0d1829", "#4e6a79", "#99bac4", "#6a8a95", "#577586"] },
    { value: "暗黑冷色调", photo: "/presets/colors/23.webp", prompt: "暗黑冷色调，低明度高对比", colors: ["#292e30", "#0c1119", "#1c252d", "#151c23", "#324850"] },
    { value: "单色红色调", photo: "/presets/colors/24.webp", prompt: "单色红色调，浓烈直白", colors: ["#890d16", "#751016", "#2d0f10", "#521315", "#a7111b"] },
    { value: "绛红紫灰色调", photo: "/presets/colors/25.webp", prompt: "绛红与紫灰色调，冷艳", colors: ["#180508", "#2a0e11", "#500a13", "#36272e", "#493036"] },
    { value: "都市暮色蓝调", photo: "/presets/colors/26.webp", prompt: "都市暮色蓝调，蓝紫渐变", colors: ["#130c19", "#261525", "#745267", "#6f4858", "#54374e"] },
    { value: "黑白纪实色调", photo: "/presets/colors/27.webp", prompt: "黑白纪实色调，硬朗对比", colors: ["#2e2e2e", "#171717", "#4e4e4e", "#e4e4e4", "#d4d4d4"] },
];

/** 风格：每项给 3 个代表色，用渐变色块当预览底。 */
// 风格预览直接用即梦同款短片（10 段 mp4，命名与即梦一致）。
export const stylePresets: ColorPreset[] = [
    { value: "复古对称美学", photo: "/presets/styles/01-复古对称美学.mp4", prompt: "复古胶片质感，严格对称构图，暖褐色调，轻微颗粒", colors: ["#8a4a3a", "#2f5a5e", "#e0d6c0"] },
    { value: "3D动画风", photo: "/presets/styles/02-3D动画风.mp4", prompt: "3D 动画风格，圆润造型，柔和全局光，卡通材质", colors: ["#f0c9a0", "#c98a5a", "#f7ecd9"] },
    { value: "治愈日漫风", photo: "/presets/styles/03-治愈日漫风.mp4", prompt: "日系治愈动画风，柔和逆光，粉彩色调，细腻线稿", colors: ["#a8d9c0", "#f0d9a8", "#dff0e8"] },
    { value: "港夜迷离风", photo: "/presets/styles/04-港夜迷离风.mp4", prompt: "港风夜景，霓虹灯光，湿润街面反光，胶片颗粒", colors: ["#1a3a4a", "#e0435a", "#2f6f8a"] },
    { value: "哥特式恐怖", photo: "/presets/styles/05-哥特式恐怖.mp4", prompt: "哥特恐怖风格，高对比冷色，阴森雾气，暗部厚重", colors: ["#1a1a24", "#4a3a5a", "#c9a25e"] },
    { value: "邵氏武侠风", photo: "/presets/styles/06-邵氏武侠风.mp4", prompt: "邵氏武侠电影风，浓郁暖色，硬朗布光，胶片颗粒", colors: ["#8a3a2a", "#c9a25e", "#2a1a14"] },
    { value: "丧尸列车", photo: "/presets/styles/07-丧尸列车.mp4", prompt: "末日丧尸题材，逼仄车厢空间，冷绿光，脏乱质感", colors: ["#3a4a3a", "#7a8a70", "#1a1a1a"] },
    { value: "美式迷幻青春", photo: "/presets/styles/08-美式迷幻青春.mp4", prompt: "美式青春迷幻风，霓虹烟雾，粉紫高饱和，胶片颗粒", colors: ["#c04fa0", "#4a2fa0", "#f0a8d9"] },
    { value: "台湾偶像剧", photo: "/presets/styles/09-台湾偶像剧.mp4", prompt: "台湾偶像剧风，清新暖调，柔光滤镜，明亮通透", colors: ["#f7e9d9", "#c9e0d9", "#a8c9b8"] },
    { value: "异常阈限空间", photo: "/presets/styles/10-异常阈限空间.mp4", prompt: "阈限空间风格，空旷室内，惨白荧光灯，诡异安静", colors: ["#c9c9b0", "#7a8a5a", "#2a2a24"] },
];

/** 把选中的预设拼进提示词；同一段再点一次即移除。 */
export function togglePromptFragment(prompt: string, fragment: string) {
    const parts = prompt.split("，").map((item) => item.trim()).filter(Boolean);
    const index = parts.indexOf(fragment);
    if (index >= 0) parts.splice(index, 1);
    else parts.push(fragment);
    return parts.join("，");
}

export function hasPromptFragment(prompt: string, fragment: string) {
    return prompt.split("，").map((item) => item.trim()).includes(fragment);
}

/** 每个预设的滤镜（作用在基础人像图上），以及焦距对应的画面放大倍率。 */
export const CAMERA_FILTERS: Record<string, string> = {
    黑白纪实: "grayscale(1) contrast(1.15)",
    "Y2K卡片机": "saturate(1.25) contrast(.92) brightness(1.06)",
    现代数字: "saturate(1.05) contrast(1.02)",
    电影胶片: "sepia(.28) contrast(1.06) saturate(.9)",
    鱼眼广角镜头: "saturate(1.1)",
    漏光镜头: "contrast(.95) brightness(1.05)",
    干净锐利镜头: "contrast(1.08) saturate(1.05)",
    银幕电影镜头: "contrast(1.12) saturate(.92)",
};
export const CAMERA_ZOOM: Record<string, number> = { "24mm": 1, "35mm": 1.06, "85mm": 1.22, "135mm": 1.4 };
export const CAMERA_APERTURE_FILTER: Record<string, string> = {
    "f1.4浅景深": "brightness(1.03)",
    "f4中景深": "",
    "f11深景深": "contrast(1.05)",
};
export const PALETTE_FILTERS: Record<string, string> = {
    日系清新色调: "brightness(1.08) saturate(.85)",
    雾蓝米白色调: "saturate(.7) hue-rotate(10deg) brightness(1.05)",
    复古糖果色调: "saturate(1.3) hue-rotate(-8deg)",
    暖黄灰褐色调: "sepia(.3) saturate(.9)",
    冷青琥珀色调: "hue-rotate(8deg) saturate(1.1)",
    南法假日色调: "saturate(1.15) brightness(1.05) sepia(.15)",
    沙漠史诗色调: "sepia(.35) saturate(1.1) contrast(1.05)",
    复古好莱坞色调: "sepia(.4) contrast(1.05)",
    幻彩史诗色调: "saturate(1.6) hue-rotate(-15deg)",
    过期暖黄色调: "sepia(.45) brightness(1.02)",
    琥珀棕褐色调: "sepia(.5) saturate(1.1)",
    法式红绿色调: "hue-rotate(-5deg) saturate(1.2)",
    墨绿暖黄色调: "hue-rotate(12deg) saturate(1.15) brightness(.95)",
    灰绿砖红色调: "hue-rotate(-10deg) saturate(.9)",
    韩系冷青色调: "brightness(1.06) saturate(.8) hue-rotate(6deg)",
    赛博冷绿色调: "hue-rotate(35deg) saturate(1.5) brightness(.92)",
    灰蓝海岸色调: "hue-rotate(10deg) saturate(.75) brightness(.98)",
    米黄天蓝色调: "hue-rotate(14deg) brightness(1.06) saturate(.85)",
    青橙色调: "saturate(1.35) hue-rotate(-12deg) contrast(1.08)",
    港片霓虹色调: "saturate(1.5) hue-rotate(-20deg) contrast(1.1) brightness(.95)",
    孔雀蓝色调: "hue-rotate(25deg) saturate(1.3)",
    单色蓝色调: "grayscale(1) sepia(.4) hue-rotate(180deg) saturate(1.6)",
    暗黑冷色调: "brightness(.75) contrast(1.2) saturate(.8) hue-rotate(10deg)",
    单色红色调: "grayscale(1) sepia(.5) hue-rotate(-40deg) saturate(2.2)",
    绛红紫灰色调: "hue-rotate(-25deg) saturate(.9) brightness(.96)",
    都市暮色蓝调: "hue-rotate(18deg) saturate(1.15) brightness(.9)",
    黑白纪实色调: "grayscale(1) contrast(1.15)",
};
export const STYLE_FILTERS: Record<string, string> = {
    "3D动漫": "saturate(1.3) brightness(1.05)",
    "3D漫剧": "contrast(1.12) saturate(1.2)",
    "3D国风/3D仙侠": "hue-rotate(6deg) saturate(1.1) brightness(1.04)",
    "3D卡通/CG风格": "saturate(1.35) brightness(1.06)",
    写实风格: "contrast(1.04) saturate(.98)",
    仿真人写实: "contrast(1.03) saturate(.95) brightness(1.02)",
    电影写实风: "contrast(1.14) saturate(1.08) brightness(.94)",
    照片级写实: "contrast(1.02) brightness(1.03)",
    轻拟真卡通Pixar化: "saturate(1.25) brightness(1.06)",
    年代写实风: "sepia(.3) contrast(1.02) saturate(.85)",
};
export const BASE_PHOTOS = ["/presets/base-a.jpg", "/presets/base-b.jpg"];

/** 从节点元数据里取出当前选择的预设描述片段，生成时拼进提示词。 */
export function presetFragments(metadata?: {
    presetCamera?: Record<string, string>;
    presetPalette?: string;
    presetStyle?: string;
    presetCustomPalettes?: { value: string; name: string; colors: string[]; prompt: string }[];
} | null): string[] {
    if (!metadata) return [];
    const camera = cameraSections.flatMap((section) => {
        const value = metadata.presetCamera?.[section.key];
        const option = section.options.find((option) => option.value === value);
        return option?.prompt ? [option.prompt] : [];
    });
    const palette = colorPresets.find((item) => item.value === metadata.presetPalette)?.prompt
        ?? metadata.presetCustomPalettes?.find((item) => item.value === metadata.presetPalette)?.prompt;
    const style = stylePresets.find((item) => item.value === metadata.presetStyle)?.prompt;
    return [...camera, ...(palette ? [palette] : []), ...(style ? [style] : [])];
}

/** 自定义配色的提示词：把色值直接描述给模型。 */
export function customPalettePrompt(name: string, colors: string[]) {
    return `自定义配色「${name}」，主色调 ${colors[0]}${colors.length > 1 ? `，辅以 ${colors.slice(1).join("、")}` : ""}`;
}

/** 从图片像素里提取 5 个主色（简单分桶统计，跳过过亮过暗与近重复色）。 */
export function extractPaletteColors(pixels: Uint8ClampedArray, size: number): string[] {
    const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < pixels.length; i += 4 * Math.max(1, Math.floor((size * size) / 2048))) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max > 248 && min > 235) continue;
        if (max < 18) continue;
        const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
        const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        bucket.n += 1; bucket.r += r; bucket.g += g; bucket.b += b;
        buckets.set(key, bucket);
    }
    const picked: { hex: string; r: number; g: number; b: number }[] = [];
    const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
    for (const bucket of sorted) {
        const r = Math.round(bucket.r / bucket.n), g = Math.round(bucket.g / bucket.n), b = Math.round(bucket.b / bucket.n);
        const near = picked.some((item) => Math.abs(item.r - r) + Math.abs(item.g - g) + Math.abs(item.b - b) < 90);
        if (near) continue;
        picked.push({ hex: `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`, r, g, b });
        if (picked.length >= 5) break;
    }
    return picked.map((item) => item.hex);
}
