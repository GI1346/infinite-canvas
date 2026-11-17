/** 桌面端一键更新桥：只有 Electron 里存在，浏览器里为 undefined。 */
export type UpdateProgress = { percent: number; received: number; total: number };

declare global {
    interface Window {
        blinkflowUpdater?: {
            hot: (version: string) => Promise<{ version: string; files: number }>;
            install: (version: string) => Promise<{ path: string }>;
            onProgress: (handler: (progress: UpdateProgress) => void) => () => void;
        };
    }
}

export function desktopUpdater() {
    return typeof window === "undefined" ? undefined : window.blinkflowUpdater;
}
