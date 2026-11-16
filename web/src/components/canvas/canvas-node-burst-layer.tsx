import { useEffect, useRef } from "react";

import { gridMetrics, gridOrigin } from "@/lib/canvas/canvas-grid";
import { onNodeBurst } from "@/lib/canvas/canvas-node-creation";
import type { ViewportTransform } from "@/types/canvas";

// 新建节点时整屏点阵被染色：左半暖色、右半冷色，从节点中心向外推开再淡出。
const WARM = [
    [201, 138, 74],
    [201, 106, 74],
    [201, 162, 74],
    [176, 107, 74],
];
const COOL = [
    [107, 127, 217],
    [90, 150, 217],
    [154, 107, 217],
    [90, 165, 217],
];
const PALETTE = [...WARM, ...COOL];
const ALPHA_BUCKETS = 14;
const LIFETIME = 1600;
const WAVE_MS = 900;

/** 铺满当前视口的一层点阵特效：直接点亮背景点阵里对应的那些点，间距跟着缩放走。 */
export function CanvasNodeBurstLayer({ viewport }: { viewport: ViewportTransform }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // 存世界坐标，画布平移/缩放后特效仍跟着节点走。
    const burstsRef = useRef<{ wx: number; wy: number; start: number }[]>([]);
    const viewportRef = useRef(viewport);
    viewportRef.current = viewport;

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;

        const dpr = () => window.devicePixelRatio || 1;
        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(1, Math.round(rect.width * dpr()));
            canvas.height = Math.max(1, Math.round(rect.height * dpr()));
        };
        resize();

        const unsubscribe = onNodeBurst(({ x, y }) => {
            const { x: vx, y: vy, k } = viewportRef.current;
            burstsRef.current.push({ wx: (x - vx) / k, wy: (y - vy) / k, start: performance.now() });
        });

        let frame = 0;
        const render = (now: number) => {
            const scale = dpr();
            const width = canvas.width / scale;
            const height = canvas.height / scale;
            context.setTransform(scale, 0, 0, scale, 0, 0);
            context.clearRect(0, 0, width, height);

            burstsRef.current = burstsRef.current.filter((burst) => now - burst.start < LIFETIME);
            // 和背景点阵完全同一套间距与相位：点变细腻，特效也跟着细腻。
            const { x: vx, y: vy, k } = viewportRef.current;
            const { size } = gridMetrics(k);
            const radius = Math.min(1.2, Math.max(0.85, size * 0.075));
            const firstX = gridOrigin(size, vx);
            const firstY = gridOrigin(size, vy);
            // 形状按即梦 logo 的四角星算：|x|^0.6 + |y|^0.6 <= 1，四个尖角伸到视口边上，凹边向内收
            const reach = Math.hypot(width, height) / 2 * 1.02;

            for (const burst of burstsRef.current) {
                const elapsed = now - burst.start;
                const bx = burst.wx * k + vx;
                const by = burst.wy * k + vy;
                // 按「调色 × 透明度档」聚合，一帧只做几十次 fill，低缩放下上万颗点也不卡。
                const paths: Path2D[][] = PALETTE.map(() => Array.from({ length: ALPHA_BUCKETS + 1 }, () => new Path2D()));
                for (let x = firstX; x < width + size; x += size) {
                    for (let y = firstY; y < height + size; y += size) {
                        const dx = Math.abs(x - bx) / reach;
                        const dy = Math.abs(y - by) / reach;
                        const shape = Math.pow(dx, 0.6) + Math.pow(dy, 0.6);
                        if (shape > 1) continue;
                        // 离节点越远越晚亮，形成从节点向外推开的波
                        const distance = Math.hypot(x - bx, y - by);
                        const delay = Math.min(320, distance * 0.2);
                        const progress = (elapsed - delay) / WAVE_MS;
                        if (progress <= 0 || progress >= 1) continue;
                        // 越靠近星形外沿越淡，边界自然化没
                        const spatial = 1 - Math.pow(shape, 6);
                        const alpha = Math.sin(Math.PI * progress) * 0.95 * spatial;
                        if (alpha < 0.015) continue;
                        const tone = (Math.round((x - firstX) / size) * 7 + Math.round((y - firstY) / size) * 13) % 4;
                        const paletteIndex = (x < bx ? 0 : 4) + tone;
                        const bucket = Math.min(ALPHA_BUCKETS, Math.max(1, Math.round(alpha * ALPHA_BUCKETS)));
                        paths[paletteIndex][bucket].rect(x - radius, y - radius, radius * 2, radius * 2);
                    }
                }
                for (let paletteIndex = 0; paletteIndex < PALETTE.length; paletteIndex += 1) {
                    const [r, g, b] = PALETTE[paletteIndex];
                    for (let bucket = 1; bucket <= ALPHA_BUCKETS; bucket += 1) {
                        context.fillStyle = `rgba(${r},${g},${b},${(bucket / ALPHA_BUCKETS * 0.95).toFixed(3)})`;
                        context.fill(paths[paletteIndex][bucket]);
                    }
                }
            }

            frame = requestAnimationFrame(render);
        };
        frame = requestAnimationFrame(render);
        window.addEventListener("resize", resize);

        return () => {
            cancelAnimationFrame(frame);
            unsubscribe();
            window.removeEventListener("resize", resize);
        };
    }, []);

    return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
