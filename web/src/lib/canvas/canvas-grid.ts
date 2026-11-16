/**
 * 画布背景点阵的公共参数：背景层和新建节点的点阵特效必须用同一套间距/对齐方式，
 * 否则特效会和自己脚下的点错位。
 */
export const GRID_WORLD_SIZE = 24;

/** 点距（屏幕 px）跟着缩放走：缩小 → 更细更密，放大 → 更疏；两端各留一档翻倍/减半。 */
export function gridMetrics(scale: number) {
    let world = GRID_WORLD_SIZE;
    while (world * scale < 6) world *= 2;
    while (world * scale > 40) world /= 2;
    const size = world * scale;
    // 点越密越淡，避免低缩放下整片发灰。
    const opacity = Math.min(1, Math.max(0.4, size / 24));
    return { size, opacity };
}

/** 背景点阵里一颗点的圆心在视口内的第一个坐标（原点可能为负，便于从视口外开始铺）。 */
export function gridOrigin(size: number, offset: number) {
    const shift = ((offset % size) + size) % size;
    return shift + size / 2 - Math.ceil((shift + size / 2) / size) * size;
}
