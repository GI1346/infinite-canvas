import { useEffect } from "react";

/** 用原生 setter 写值并派发 input，React 受控组件才会感知到变化。 */
function setNativeInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const prototype = element instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (valueSetter) valueSetter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * 全局双引号自动配对：输入 “ 或 " 时补成 “”（或 ""），光标停在中间。
 * 只在 input 事件里处理 —— 中文输入法下 keydown 拦不住（isComposing 仍为 false 且输入法会忽略 preventDefault），
 * 之前正是 keydown 插了一对英文 ""、输入法又塞了一个 “，才叠成 3 个引号。
 */
export function useAutoPairQuotes() {
    useEffect(() => {
        let isInternalChange = false;

        const handleInput = (event: Event) => {
            if (isInternalChange) return;
            const inputEvent = event as InputEvent;
            // 忽略删除、撤销、粘贴等非字符插入事件。
            if (inputEvent.inputType && !inputEvent.inputType.startsWith("insertText") && !inputEvent.inputType.startsWith("insertCompositionText")) return;

            const data = inputEvent.data;
            if (!data) return;

            // 1. 中文输入法吐出的单个 “ 或 ”；2. 英文（大小写）的 "；3. 部分输入法直接吐出成对的 “” / ""
            const isSingleChineseQuote = data === "“" || data === "”";
            const isSingleEnglishQuote = data === '"';
            const isPairedQuotes = data === "“”" || data === '""';
            if (!isSingleChineseQuote && !isSingleEnglishQuote && !isPairedQuotes) return;

            const target = event.target as HTMLElement | null;
            if (!target) return;

            const english = isSingleEnglishQuote || data === '""';
            const openChar = english ? '"' : "“";
            const closeChar = english ? '"' : "”";

            // 情况 A：标准 <textarea> / <input>
            if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
                if (target.readOnly || target.disabled) return;
                const caret = target.selectionStart;
                if (caret === null) return;
                const value = target.value;

                isInternalChange = true;

                // 输入法一次吐出成对的引号：只把光标退到中间。
                if (isPairedQuotes) {
                    const midPos = Math.max(0, caret - 1);
                    target.setSelectionRange(midPos, midPos);
                    requestAnimationFrame(() => {
                        target.setSelectionRange(midPos, midPos);
                        isInternalChange = false;
                    });
                    return;
                }

                // 光标原本就贴在已有的右引号前：这次敲的引号用来「跳过」它，避免出现 “”内容 “”” 三连引号。
                if (value[caret] === closeChar) {
                    setNativeInputValue(target, value.slice(0, caret - 1) + value.slice(caret));
                    target.setSelectionRange(caret, caret);
                    requestAnimationFrame(() => {
                        target.setSelectionRange(caret, caret);
                        isInternalChange = false;
                    });
                    return;
                }

                // 单个引号：把刚输入的那个字符换成完整的左右引号，光标停中间。
                const insertIndex = Math.max(0, caret - 1);
                const nextValue = value.slice(0, insertIndex) + openChar + closeChar + value.slice(caret);
                const midCaret = insertIndex + 1;
                setNativeInputValue(target, nextValue);
                target.setSelectionRange(midCaret, midCaret);
                requestAnimationFrame(() => {
                    target.setSelectionRange(midCaret, midCaret);
                    isInternalChange = false;
                });
                return;
            }

            // 情况 B：contentEditable 富文本提示词输入框（如 canvas-prompt-chip-input.tsx）
            if (target.isContentEditable) {
                const selection = window.getSelection();
                if (!selection || selection.rangeCount === 0) return;
                const range = selection.getRangeAt(0);
                const node = range.startContainer;
                const offset = range.startOffset;
                if (node.nodeType !== Node.TEXT_NODE || node.textContent === null) return;

                const text = node.textContent;
                isInternalChange = true;

                if (isPairedQuotes) {
                    const midOffset = Math.max(0, offset - 1);
                    const nextRange = document.createRange();
                    nextRange.setStart(node, midOffset);
                    nextRange.setEnd(node, midOffset);
                    selection.removeAllRanges();
                    selection.addRange(nextRange);
                    requestAnimationFrame(() => {
                        isInternalChange = false;
                    });
                    return;
                }

                if (text[offset] === closeChar) {
                    // 贴在已有右引号前：删掉刚输入的引号，光标停在右引号后面。
                    node.textContent = text.slice(0, offset - 1) + text.slice(offset);
                    const nextRange = document.createRange();
                    nextRange.setStart(node, offset);
                    nextRange.setEnd(node, offset);
                    selection.removeAllRanges();
                    selection.addRange(nextRange);
                    target.dispatchEvent(new Event("input", { bubbles: true }));
                    requestAnimationFrame(() => {
                        isInternalChange = false;
                    });
                    return;
                }

                const replaceStart = Math.max(0, offset - 1);
                node.textContent = text.slice(0, replaceStart) + openChar + closeChar + text.slice(offset);
                const midOffset = replaceStart + 1;
                const nextRange = document.createRange();
                nextRange.setStart(node, midOffset);
                nextRange.setEnd(node, midOffset);
                selection.removeAllRanges();
                selection.addRange(nextRange);
                target.dispatchEvent(new Event("input", { bubbles: true }));
                requestAnimationFrame(() => {
                    isInternalChange = false;
                });
            }
        };

        window.addEventListener("input", handleInput, true);
        return () => {
            window.removeEventListener("input", handleInput, true);
        };
    }, []);
}
