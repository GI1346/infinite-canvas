import imageCompression from "browser-image-compression";
import compressionWorkerUrl from "browser-image-compression/dist/browser-image-compression.js?url";
import { dataUrlToFile } from "@/lib/image-utils";
import { imageToDataUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";

export type ReferenceImageCompressionSettings = {
    imageCompressionEnabled?: boolean;
    imageCompressionResolution?: "1k" | "2k" | "4k";
    imageCompressionMaxMb?: number;
};

// Only request-local copies are changed; original canvas files and storage keys are untouched.
export async function compressReferenceImages(images: ReferenceImage[], settings?: ReferenceImageCompressionSettings, signal?: AbortSignal): Promise<ReferenceImage[]> {
    if (!settings?.imageCompressionEnabled || !images.length) return images;
    const maxSizeMB = settings.imageCompressionMaxMb ?? 1;
    const maxEdge = { "1k": 1024, "2k": 2048, "4k": 4096 }[settings.imageCompressionResolution ?? "2k"];
    if (!Number.isFinite(maxSizeMB) || maxSizeMB <= 0 || !maxEdge) throw new Error("图片压缩：单图上限必须是大于 0 的 MB 数值，最长边请选择 1K、2K 或 4K");
    const result: ReferenceImage[] = [];
    for (const image of images) {
        signal?.throwIfAborted();
        const dataUrl = await imageToDataUrl(image, { signal });
        const file = dataUrlToFile({ ...image, dataUrl });
        const original = await imageCompression.loadImage(dataUrl);
        signal?.throwIfAborted();
        if (file.size <= maxSizeMB * 1024 * 1024 && Math.max(original.naturalWidth, original.naturalHeight) <= maxEdge) {
            result.push(image);
            continue;
        }
        const compressed = await imageCompression(file, {
            maxSizeMB, maxWidthOrHeight: maxEdge, maxIteration: 100, signal,
            useWebWorker: true, libURL: compressionWorkerUrl,
            fileType: file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg",
        });
        signal?.throwIfAborted();
        const output = await imageCompression.getDataUrlFromFile(compressed);
        const decoded = await imageCompression.loadImage(output);
        signal?.throwIfAborted();
        if (compressed.size > maxSizeMB * 1024 * 1024 || Math.max(decoded.naturalWidth, decoded.naturalHeight) > maxEdge) {
            throw new Error(`图片压缩：${image.name} 未达到 ${maxEdge}px / ${maxSizeMB} MB 上限，请调整后重试`);
        }
        const extension = compressed.type === "image/png" ? "png" : compressed.type === "image/webp" ? "webp" : "jpg";
        result.push({ ...image, dataUrl: output, type: compressed.type, name: image.name.replace(/\.[^.]+$/, "") + "." + extension, url: undefined, storageKey: undefined });
    }
    return result;
}