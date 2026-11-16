/**
 * 新节点标记：节点创建瞬间登记一次，渲染后由节点组件消费掉，
 * 用来只在"刚创建"的节点上播放一次彩点扩散，打开已有画布时不回放。
 */
const created = new Set<string>();

export function markNodeCreated(id: string) {
    created.add(id);
}

export function consumeNodeCreated(id: string) {
    if (!created.delete(id)) return false;
    return true;
}

/** 节点渲染后把自身在屏幕上的中心点广播出去，由画布层的整屏点阵特效接收。 */
type BurstListener = (point: { x: number; y: number }) => void;

const burstListeners = new Set<BurstListener>();

export function onNodeBurst(listener: BurstListener) {
    burstListeners.add(listener);
    return () => {
        burstListeners.delete(listener);
    };
}

export function emitNodeBurst(point: { x: number; y: number }) {
    burstListeners.forEach((listener) => listener(point));
}
