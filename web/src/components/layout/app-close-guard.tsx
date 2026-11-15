import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

declare global {
    interface Window {
        blinkflowApp?: {
            onCloseRequest: (handler: () => void) => () => void;
            confirmClose: () => void;
        };
    }
}

/** 桌面版点关闭时由主进程先问一次；这里按应用主题给出和参考图一致的确认框。 */
export function AppCloseGuard() {
    const [asking, setAsking] = useState(false);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    useEffect(() => window.blinkflowApp?.onCloseRequest(() => setAsking(true)), []);

    useEffect(() => {
        if (!asking) return;
        const cancel = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setAsking(false);
        };
        window.addEventListener("keydown", cancel, true);
        return () => window.removeEventListener("keydown", cancel, true);
    }, [asking]);

    if (!asking || !window.blinkflowApp) return null;

    return (
        <div data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore className="fixed inset-0 z-[3000] flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,.45)" }} onPointerDown={(event) => event.target === event.currentTarget && setAsking(false)}>
            <div role="dialog" aria-modal="true" aria-label="关闭软件" className="relative w-[500px] max-w-full rounded-[26px] border p-6" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text, boxShadow: theme.toolbar.shadow }}>
                <button type="button" aria-label="取消关闭" className="absolute right-4 top-4 grid size-9 place-items-center rounded-full opacity-70 transition-opacity hover:opacity-100" style={{ background: theme.node.fill }} onClick={() => setAsking(false)}>
                    <X size={17} />
                </button>
                <div className="grid size-14 place-items-center rounded-2xl bg-[#ef4444]">
                    <AlertTriangle size={26} color="#fff" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold">关闭 BlinkFlow?</h2>
                <p className="mt-2 text-sm" style={{ color: theme.node.muted }}>确定要关闭软件吗？画布内容会实时保存，下次打开继续。</p>
                <div className="mt-7 flex justify-end gap-3">
                    <button type="button" className="h-11 min-w-24 rounded-full px-5 text-sm font-medium transition-opacity hover:opacity-80" style={{ background: theme.node.fill, color: theme.node.text }} onClick={() => setAsking(false)}>取消</button>
                    <button type="button" className="h-11 min-w-28 rounded-full px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "#ef4444" }} onClick={() => window.blinkflowApp?.confirmClose()}>关闭软件</button>
                </div>
            </div>
        </div>
    );
}
