import { App, Checkbox, Modal } from "antd";
import { useEffect, useState } from "react";

import { buildCanvasExportFolders, collectWorkflowAssets, serializeWorkflowToJson, type WorkflowGraph } from "@/lib/canvas/workflow-json";
import { exportFoldersToDirectory, exportName, saveWorkflowJsonFile } from "@/lib/export-fs";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { useThemeStore } from "@/stores/use-theme-store";

export type ExportRequest = { kind: "projects"; projects: CanvasProject[]; dated?: boolean } | { kind: "workflow"; graph: WorkflowGraph };

export function CanvasExportDialog({ request, onClose }: { request: ExportRequest; onClose: () => void }) {
    const { message } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const graph = request.kind === "workflow" ? request.graph : null;
    const [backup, setBackup] = useState(true), [compressWebp, setCompressWebp] = useState(false), [busy, setBusy] = useState(false);
    const [prepared, setPrepared] = useState<Awaited<ReturnType<typeof collectWorkflowAssets>>>();
    const [error, setError] = useState("");
    useEffect(() => {
        if (!graph) return;
        let active = true;
        void collectWorkflowAssets(graph).then((result) => { if (active) setPrepared(result); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "无法读取工作流素材"); });
        return () => { active = false; };
    }, [graph]);

    const confirm = async () => {
        if (busy || (graph && !prepared)) return;
        setBusy(true);
        setError("");
        try {
            if (request.kind === "projects") {
                const { projects, dated } = request;
                const result = await exportFoldersToDirectory(() => buildCanvasExportFolders(projects, backup, Boolean(dated)), projects.length === 1 ? projects[0].title : "BlinkFlow 画布导出");
                if (result.canceled) return;
                message.success(result.zip ? "已下载画布资源 ZIP" : `已导出 ${result.writtenFiles} 个文件到 ${result.directory}`);
            } else {
                const result = await saveWorkflowJsonFile(`${exportName(request.graph.name)}.blinkflow.json`, () => serializeWorkflowToJson({ ...request.graph, compressWebp, collected: prepared }));
                if (result.canceled) return;
                message.success(result.filePath ? `已保存工作流：${result.filePath}` : "已下载工作流 JSON");
            }
            onClose();
        } catch (reason) { setError(reason instanceof Error ? reason.message : "导出失败，请检查目录权限与剩余空间后重试"); }
        finally { setBusy(false); }
    };
    const imageCount = prepared ? [...prepared.assets.values()].filter(({ blob }) => blob.type.startsWith("image/")).length : 0;
    return <Modal open centered width={440} title={graph ? "导出工作流 (.json)" : "导出画布资源（选目录）"}
        okText={graph ? "保存 .json 文件" : "选择目录并导出"} cancelText="取消" confirmLoading={busy} closable={!busy} maskClosable={false} keyboard={!busy}
        okButtonProps={{ disabled: Boolean(graph && !prepared) }} cancelButtonProps={{ disabled: busy }} onOk={confirm} onCancel={onClose}
        styles={{ container: { ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text } }}
        modalRender={(modal) => <div data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore>{modal}</div>}>
        <div className="space-y-3 py-2 text-sm">
            {request.kind === "projects" ? <>
                <p className="text-xs leading-relaxed opacity-75">已选 {request.projects.length} 个画布。每个画布会单独建文件夹，图片按原始格式保存。</p>
                <Checkbox checked={backup} disabled={busy} onChange={(event) => setBackup(event.target.checked)}>同时附带 .blinkflow.json 工程备份（含连线与图片）</Checkbox>
            </> : <>
                <p aria-live="polite" className="rounded-lg border px-3 py-2 font-mono text-xs tabular-nums" style={{ borderColor: theme.node.stroke }}>{request.graph.nodes.length} 个节点 · {prepared?.connections.length ?? request.graph.connections.length} 条连线 · {prepared ? `${imageCount} 张去重图片` : error ? "图片读取失败" : "正在统计图片…"}</p>
                <Checkbox checked={compressWebp} disabled={busy} onChange={(event) => setCompressWebp(event.target.checked)}>压缩内嵌图片为 WebP（减小体积）</Checkbox>
                <p className="text-xs leading-relaxed opacity-75">默认按原始字节嵌入图片。开启压缩会重新编码，可能降低画质。</p>
            </>}
            {!window.blinkflowDesktop && !(graph ? window.showSaveFilePicker : window.showDirectoryPicker) && <p className="text-xs opacity-75">当前环境不支持系统选择器，将下载{graph ? " JSON 文件" : " ZIP 压缩包"}。</p>}
            {error && <p role="alert" className="break-words text-xs text-red-500">{error}</p>}
        </div>
    </Modal>;
}
