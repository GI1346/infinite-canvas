declare global {
    interface Window {
        blinkflowTheme?: { set: (theme: "dark" | "light") => Promise<boolean> };
    }
}

/**
 * 桌面版的 <select> 弹出层、右键菜单等由系统绘制，不读页面 CSS。
 * 把应用主题同步给主进程的 nativeTheme，这些原生界面才会跟着变暗。
 * 网页版没有这条通道，直接跳过。
 */
export function syncNativeTheme(dark: boolean) {
    void window.blinkflowTheme?.set(dark ? "dark" : "light").catch(() => undefined);
}
