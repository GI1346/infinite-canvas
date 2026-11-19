/**
 * 剪贴板读写。
 *
 * 浏览器/渲染进程的异步剪贴板 API 有三个硬性限制，也是"有时能用有时不能用"的根因：
 * 1. 必须拥有窗口焦点，弹窗、菜单或切到别的窗口后会直接拒绝；
 * 2. 必须处在用户手势的有效期内，异步转换图片稍慢就过期；
 * 3. 读图片需要 clipboard-read 权限，被拒时异常还是静默都有。
 *
 * 桌面版因此走主进程的 Electron clipboard（无焦点与手势限制）；网页版保留标准 API，
 * 并对文本回退到 execCommand，尽量让"偶尔失败"变成"要么成功要么明确报错"。
 */

type NativeClipboardPayload = { text?: string; png?: ArrayBuffer };
type NativeClipboardRead = { text: string; png: Uint8Array | ArrayBuffer | null };
type NativeClipboardPeek = { text: string; hasImage: boolean };

declare global {
    interface Window {
        blinkflowClipboard?: {
            write: (payload: NativeClipboardPayload) => Promise<boolean>;
            read: () => Promise<NativeClipboardRead>;
            peek?: () => NativeClipboardPeek | null;
        };
    }
}

const native = () => (typeof window === "undefined" ? undefined : window.blinkflowClipboard);

/** 桌面版是否提供了原生剪贴板通道。 */
export function hasNativeClipboard() {
    return Boolean(native());
}

/** 当前环境是否有能力把图片写进剪贴板（桌面原生通道或浏览器异步 API）。 */
export function canWriteClipboardImage() {
    if (hasNativeClipboard()) return true;
    return typeof ClipboardItem !== "undefined" && typeof navigator !== "undefined" && typeof navigator.clipboard?.write === "function";
}

/** 写入剪贴板；图片与文本可同时写入。返回是否成功，失败时抛出的错误带可读原因。 */
export async function writeClipboard(payload: { text?: string; png?: Blob | Promise<Blob> }): Promise<void> {
    const bridge = native();
    if (bridge) {
        const png = payload.png ? await (await payload.png).arrayBuffer() : undefined;
        const ok = await bridge.write({ ...(payload.text ? { text: payload.text } : {}), ...(png ? { png } : {}) });
        if (!ok) throw new Error("剪贴板写入失败");
        return;
    }
    const { text, png } = payload;
    if (png && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        // 先发起写入以保留点击授权，图片可以随后读取或转码。
        const item: Record<string, Blob | Promise<Blob>> = { "image/png": png };
        if (text) item["text/plain"] = new Blob([text], { type: "text/plain" });
        await navigator.clipboard.write([new ClipboardItem(item)]);
        return;
    }
    if (text) await writeClipboardText(text);
}

/** 只写文本；异步 API 不可用时回退到 execCommand。 */
export async function writeClipboardText(text: string): Promise<void> {
    const bridge = native();
    if (bridge) {
        if (!(await bridge.write({ text }))) throw new Error("剪贴板写入失败");
        return;
    }
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
            // 焦点丢失或权限被拒时继续尝试同步回退。
        }
    }
    if (!copyTextWithExecCommand(text)) throw new Error("剪贴板写入失败");
}

/** 同步回退：临时 textarea + execCommand，老浏览器与失焦场景仍可用。 */
function copyTextWithExecCommand(text: string) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.append(area);
    const selection = document.getSelection();
    const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    area.select();
    let copied = false;
    try {
        copied = document.execCommand("copy");
    } catch {
        copied = false;
    }
    area.remove();
    if (previous && selection) {
        selection.removeAllRanges();
        selection.addRange(previous);
    }
    return copied;
}

/** 右键粘贴直接读取剪贴板，不依赖浏览器产生 paste 事件。 */
export async function readCanvasClipboard() {
    const bridge = native();
    if (bridge) {
        const { text, png } = await bridge.read();
        return { text, images: nativeClipboardImages(png), html: "" };
    }
    if (!navigator.clipboard?.read) {
        if (!navigator.clipboard?.readText) throw new Error("浏览器不允许读取剪贴板，请按 Ctrl+V");
        return { text: await navigator.clipboard.readText(), images: [], html: "" };
    }
    const items = await navigator.clipboard.read();
    const readText = async (type: string) => {
        const item = items.find((current) => current.types.includes(type));
        return item ? (await item.getType(type)).text() : "";
    };
    const [text, images, html] = await Promise.all([
        readText("text/plain"),
        Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).slice(0, 1).map((type) => item.getType(type)))),
        readText("text/html"),
    ]);
    return { text, images, html };
}

function nativeClipboardImages(png: NativeClipboardRead["png"] | undefined): Blob[] {
    if (!png?.byteLength) return [];
    const bytes = png instanceof Uint8Array ? png : new Uint8Array(png);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return [new Blob([buffer], { type: "image/png" })];
}

/** 读取剪贴板中的图片；桌面版走原生通道，网页版走标准 API。 */
export async function readClipboardImages(): Promise<Blob[]> {
    const bridge = native();
    if (bridge) return nativeClipboardImages((await bridge.read())?.png);
    if (!navigator.clipboard?.read) return [];
    const items = await navigator.clipboard.read();
    return Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
}

/** 读取剪贴板文本，主要给"粘贴为文本"这类需要预判的场景用。 */
export async function readClipboardText(): Promise<string> {
    const bridge = native();
    if (bridge) return (await bridge.read())?.text || "";
    if (navigator.clipboard?.readText) {
        try {
            return await navigator.clipboard.readText();
        } catch {
            return "";
        }
    }
    return "";
}

/**
 * 同步读一眼系统剪贴板：桌面版走主进程，网页版没有这个能力（返回 null）。
 * 只在 Ctrl+V 的判断里用，拿不到的调用方继续交给浏览器默认粘贴。
 */
export function peekNativeClipboard(): NativeClipboardPeek | null {
    const bridge = native();
    if (!bridge?.peek) return null;
    try {
        return bridge.peek() || null;
    } catch {
        return null;
    }
}

/** 文本跨程序往返时换行会被平台改成 CRLF，比对前先统一。 */
export function normalizeClipboardText(text: string) {
    return text.replace(/\r\n?/g, "\n").trim();
}
