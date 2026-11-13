import { Select } from "antd";
import { useAssistantCompressionStore, type AssistantCompressionOwner } from "@/stores/use-assistant-compression-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function AssistantImageCompression({ owner, disabled = false }: { owner: AssistantCompressionOwner; disabled?: boolean }) {
    const settings = useAssistantCompressionStore((state) => state[owner]);
    const update = useAssistantCompressionStore((state) => state.update);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const enabled = settings.imageCompressionEnabled;
    const style = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };
    return <div data-assistant-compression={owner} className="shrink-0 space-y-2 rounded-lg border p-2 text-xs" style={style}>
        <div className="flex items-center justify-between gap-2"><span>图片压缩</span><button type="button" role="switch" aria-label={`${owner === "agent" ? "Agent" : "Harness"} 图片压缩`} aria-checked={enabled} disabled={disabled} onClick={() => update(owner, { imageCompressionEnabled: !enabled })} className="relative h-5 w-9 rounded-full disabled:opacity-40" style={{ background: enabled ? "#2563eb" : theme.node.stroke }}><span className="absolute top-0.5 size-4 rounded-full bg-white transition-transform" style={{ left: 2, transform: enabled ? "translateX(16px)" : "translateX(0)" }} /></button></div>
        <div className="flex items-center gap-2"><label className="flex items-center gap-1">最长边<Select size="small" aria-label={`${owner} 压缩最长边`} disabled={disabled || !enabled} style={{ width: 76 }} popupMatchSelectWidth={false} value={settings.imageCompressionResolution} onChange={(value) => update(owner, { imageCompressionResolution: value as "1k" | "2k" | "4k" })} options={[{ value: "1k", label: "1K" }, { value: "2k", label: "2K" }, { value: "4k", label: "4K" }]} /></label><label className="ml-auto flex min-w-0 items-center gap-1">单图上限<input type="number" step="any" aria-label={`${owner} 压缩单图上限 MB`} className="w-16 min-w-0 rounded border px-1 py-0.5 disabled:opacity-40" style={style} disabled={disabled || !enabled} value={Number.isFinite(settings.imageCompressionMaxMb) ? settings.imageCompressionMaxMb : ""} onChange={(event) => update(owner, { imageCompressionMaxMb: event.target.valueAsNumber })} />MB</label></div>
    </div>;
}
