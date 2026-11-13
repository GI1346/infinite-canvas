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

declare global {
    interface Window {
        blinkflowClipboard?: {
            write: (payload: NativeClipboardPayload) => Promise<boolean>;
            read: () => Promise<NativeClipboardRead>;
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
export async function writeClipboard(payload: { text?: string; png?: Blob }): Promise<void> {
    const bridge = native();
    if (bridge) {
        const png = payload.png ? await payload.png.arrayBuffer() : undefined;
        const ok = await bridge.write({ ...(payload.text ? { text: payload.text } : {}), ...(png ? { png } : {}) });
        if (!ok) throw new Error("剪贴板写入失败");
        return;
    }
    const { text, png } = payload;
    if (png && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        // 先解析成真实 Blob 再写入：把 Promise 交给 ClipboardItem 时，转换一失败整次写入都会作废。
        const item: Record<string, Blob> = { "image/png": png };
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

/** 读取剪贴板中的图片；桌面版走原生通道，网页版走标准 API。 */
export async function readClipboardImages(): Promise<Blob[]> {
    const bridge = native();
    if (bridge) {
        const result = await bridge.read();
        if (!result?.png) return [];
        const bytes = result.png instanceof Uint8Array ? result.png : new Uint8Array(result.png);
        if (!bytes.byteLength) return [];
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        return [new Blob([buffer], { type: "image/png" })];
    }
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
