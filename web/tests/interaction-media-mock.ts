// Only media persistence is mocked: event dispatch and all canvas/node components are real.
export async function uploadImage(url: string) { return { url, storageKey: "test:image", width: 1024, height: 1024, bytes: 3, mimeType: "image/png" }; }
export async function uploadMediaFile(url: string) { return { url, storageKey: "test:video", width: 1280, height: 720, bytes: 3, mimeType: "video/mp4" }; }
export function previewUrlFor() { return undefined; }
export function subscribeImagePreviews() { return () => {}; }
export function getImagePreviewRevision() { return 0; }
export async function ensureImagePreview() { return undefined; }

export async function getImageBlob(_key: string): Promise<Blob | null> { return null; }
export async function fetchImageBlob(url: string): Promise<Blob> { return (await fetch(url)).blob(); }

export async function imageToDataUrl(image: { dataUrl: string }) { return image.dataUrl; }
export async function cleanupUnusedImages() {}
export async function cleanupUnusedMedia() {}
export async function resolveImageUrl(_key: string, fallback = "") { return fallback; }
export async function resolveMediaUrl(_key: string, fallback = "") { return fallback; }