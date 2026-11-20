import { InputNumber, Segmented, Slider, Switch } from "antd";
import { useState } from "react";
import { useLocation } from "react-router-dom";

import { AppConfigPanel } from "@/components/layout/app-config-modal";
import { HomeAppearanceControls } from "@/components/layout/home-appearance-controls";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { useCanvasImageSettingsStore } from "@/stores/canvas/use-canvas-image-settings-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";

function SystemPreferences() {
    const colorTheme = useThemeStore((state) => state.theme), setTheme = useThemeStore((state) => state.setTheme);
    const theme = canvasThemes[colorTheme];
    const pairQuotes = useConfigStore((state) => state.config.autoPairQuotesEnabled !== false);
    const maxMb = useCanvasImageSettingsStore((state) => state.settings?.imageCompressionMaxMb ?? 1);
    // 快调区间只影响滑块；数字输入继续接受原有范围，可输入更高数值。
    const [sliderMax, setSliderMax] = useState(() => Math.max(4, Math.ceil(maxMb)));
    const surface = canvasGlass(theme);
    return <div className="mb-5 grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border p-4 lg:row-span-2" style={surface}>
            <h2 className="mb-3 text-sm font-semibold">外观与画布</h2>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>界面主题</span><Segmented aria-label="界面主题" value={colorTheme} onChange={setTheme} options={[{ value: "light", label: "浅色" }, { value: "dark", label: "深色" }]} /></div>
            <p className="mt-3 text-xs leading-relaxed" style={{ color: theme.node.muted }}>LibTV 滚轮：直接滚动平移，上下滚动时按住 Shift 横移，按住 Ctrl 缩放。</p>
            <div className="mt-4 border-t pt-4" style={{ borderColor: theme.glass.border }}>
                <h3 className="mb-3 text-sm font-semibold">主页壁纸与磨砂</h3>
                <HomeAppearanceControls />
            </div>
        </section>
        <section className="rounded-2xl border p-4" style={surface}>
            <h2 className="mb-3 text-sm font-semibold">编辑与生成</h2>
            <div className="flex items-center justify-between gap-2 text-xs"><span>中文双引号配对</span><Switch aria-label="中文双引号配对" checked={pairQuotes} onChange={(value) => useConfigStore.getState().updateConfig("autoPairQuotesEnabled", value)} /></div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span>新节点参考图压缩上限</span><span className="flex items-center gap-1"><InputNumber aria-label="新节点压缩单图上限 MB" size="small" value={maxMb} onChange={(value) => { if (value !== null) { setSliderMax((current) => Math.max(current, Math.ceil(value))); useCanvasImageSettingsStore.getState().remember({ imageCompressionMaxMb: value }); } }} /> MB</span></div>
            <Slider aria-label="快调压缩单图上限" min={Math.min(0, maxMb)} max={Math.max(sliderMax, maxMb)} step={0.1} value={maxMb} onChange={(value) => useCanvasImageSettingsStore.getState().remember({ imageCompressionMaxMb: value })} tooltip={{ formatter: (value) => `${value} MB` }} />
        </section>
        <section className="rounded-2xl border p-4" style={surface}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">版本与热更新</h2><VersionReleaseModal className="bf-mag-btn rounded-lg border px-3 py-1.5 text-xs font-medium" style={{ borderColor: theme.node.stroke, color: theme.accent.base }} /></div>
            <p className="mt-2 text-xs" style={{ color: theme.node.muted }}>点击当前版本查看更新。</p>
        </section>
    </div>;
}

export default function ConfigPage() {
    const system = useLocation().pathname === "/settings";
    return <main className="h-full overflow-y-auto bg-background">
        <div className={system ? "mx-auto max-w-[1440px] px-6 py-8 lg:px-10" : "w-full px-5 py-4"}>
            <header className={system ? "mb-7" : "mb-2"}><h1 className="text-2xl font-semibold">{system ? "系统设置" : "模型与接口"}</h1><p className={system ? "mt-2 text-sm text-muted-foreground" : "mt-1 text-sm text-muted-foreground"}>{system ? "管理本机偏好、存储和版本" : "管理渠道连接、可用模型与全局默认模型"}</p></header>
            {system && <SystemPreferences />}
            <AppConfigPanel key={system ? "system" : "models"} section={system ? "system" : "models"} initialTab={system ? "local-storage" : "channels"} />
        </div>
    </main>;
}
