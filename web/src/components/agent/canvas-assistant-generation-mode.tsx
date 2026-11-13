import { Select } from "antd";
import { useCanvasAssistantStore, type CanvasAssistantGenerationMode } from "@/stores/use-canvas-assistant-store";

export function CanvasAssistantGenerationMode() {
    const mode = useCanvasAssistantStore((state) => state.generationMode);
    const setMode = useCanvasAssistantStore((state) => state.setGenerationMode);
    return <span data-assistant-generation-mode title="自动生成直接执行后续生成；当前待确认任务仍需手动确认。"><Select size="small" aria-label="Agent 生成模式" className="min-w-0 max-w-32" popupMatchSelectWidth={false} value={mode} onChange={(value) => setMode(value as CanvasAssistantGenerationMode)} options={[{ value: "manual", label: "手动确认生成" }, { value: "auto", label: "自动生成" }]} /></span>;
}