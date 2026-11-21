import { saveAs } from "file-saver";
import { createZip } from "@/lib/zip";

export type ExportFile = { filename: string; data: Blob | string };
export type ExportFolder = { folderName: string; files: ExportFile[] };
type DirectoryResult = { canceled: boolean; directory?: string; writtenFiles?: number; zip?: boolean };
type JsonResult = { canceled: boolean; filePath?: string };
type DesktopFile = { filename: string; dataBase64?: string; textContent?: string };

declare global {
    interface Window {
        blinkflowDesktop?: {
            exportDirectoryBundle: (folders: { folderName: string; files: DesktopFile[] }[]) => Promise<DirectoryResult>;
            saveJsonFile: (suggestedName: string, json: string) => Promise<JsonResult>;
        };
        showDirectoryPicker?: (options: { mode: "readwrite" }) => Promise<FileSystemDirectoryHandle>;
        showSaveFilePicker?: (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>;
    }
}

export function exportName(value: string) {
    const clean = (value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().replace(/[ .]+$/, "").slice(0, 110).replace(/[ .]+$/, "")) || "未命名画布";
    return /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(clean) ? "_" + clean : clean;
}

export function uniqueExportName(name: string, used: Set<string>, extension = "") {
    let next = name + extension;
    for (let index = 1; used.has(next.toLowerCase()); index++) next = `${name}_${index}${extension}`;
    used.add(next.toLowerCase());
    return next;
}

export function blobDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
        reader.readAsDataURL(blob);
    });
}

async function write(handle: FileSystemFileHandle, data: Blob | string) {
    const stream = await handle.createWritable();
    try { await stream.write(data); await stream.close(); }
    catch (error) { await stream.abort().catch(() => undefined); throw error; }
}

function isCanceled(error: unknown) { return error instanceof DOMException && error.name === "AbortError"; }

// Pick inside the initial user gesture, before reading images or generating JSON.
export async function exportFoldersToDirectory(prepare: () => Promise<ExportFolder[]>, zipName: string): Promise<DirectoryResult> {
    const desktop = window.blinkflowDesktop;
    let directory: FileSystemDirectoryHandle | undefined;
    if (!desktop && window.showDirectoryPicker) {
        try { directory = await window.showDirectoryPicker({ mode: "readwrite" }); }
        catch (error) { if (isCanceled(error)) return { canceled: true }; throw error; }
    }
    const folders = await prepare();
    if (desktop) {
        const bundle = await Promise.all(folders.map(async ({ folderName, files }) => ({ folderName, files: await Promise.all(files.map(async ({ filename, data }): Promise<DesktopFile> => typeof data === "string" ? { filename, textContent: data } : { filename, dataBase64: (await blobDataUrl(data)).split(",", 2)[1] })) })));
        return desktop.exportDirectoryBundle(bundle);
    }
    const writtenFiles = folders.reduce((total, folder) => total + folder.files.length, 0);
    if (!directory) {
        saveAs(await createZip(folders.flatMap(({ folderName, files }) => files.length ? files.map(({ filename, data }) => ({ name: `${folderName}/${filename}`, data })) : [{ name: `${folderName}/`, data: "" }])), `${exportName(zipName)}.zip`);
        return { canceled: false, writtenFiles, zip: true };
    }
    const usedFolders = new Set<string>();
    for await (const name of (directory as FileSystemDirectoryHandle & { keys(): AsyncIterableIterator<string> }).keys()) usedFolders.add(name.toLowerCase());
    for (const folder of folders) {
        const target = await directory.getDirectoryHandle(uniqueExportName(folder.folderName, usedFolders), { create: true });
        for (const { filename, data } of folder.files) await write(await target.getFileHandle(filename, { create: true }), data);
    }
    return { canceled: false, directory: directory.name, writtenFiles };
}

export async function saveWorkflowJsonFile(suggestedName: string, prepare: () => Promise<string>): Promise<JsonResult> {
    if (window.blinkflowDesktop) return window.blinkflowDesktop.saveJsonFile(suggestedName, await prepare());
    if (window.showSaveFilePicker) {
        let handle: FileSystemFileHandle;
        try { handle = await window.showSaveFilePicker({ suggestedName, types: [{ description: "BlinkFlow Workflow JSON", accept: { "application/json": [".json"] } }] }); }
        catch (error) { if (isCanceled(error)) return { canceled: true }; throw error; }
        await write(handle, await prepare());
        return { canceled: false, filePath: handle.name };
    }
    saveAs(new Blob([await prepare()], { type: "application/json" }), suggestedName);
    return { canceled: false };
}
