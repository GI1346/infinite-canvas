import { useEffect } from "react";

type TextControl = HTMLInputElement | HTMLTextAreaElement;
type Edit = { text: string; start: number; end: number };

const pair = "“”";
const isTextControl = (target: HTMLElement): target is TextControl =>
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLInputElement && ["text", "search", "url", "tel", ""].includes(target.type));

function readEdit(target: HTMLElement): Edit | undefined {
  if (isTextControl(target)) {
    const { value, readOnly, disabled, selectionStart, selectionEnd } = target;
    if (!readOnly && !disabled && selectionStart !== null && selectionEnd !== null) {
      return { text: value, start: selectionStart, end: selectionEnd };
    }
    return;
  }
  const selection = window.getSelection();
  if (!target.isContentEditable || !selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!target.contains(range.startContainer) || !target.contains(range.endContainer)) return;
  const prefix = document.createRange();
  prefix.selectNodeContents(target);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = prefix.toString().length;
  prefix.setEnd(range.endContainer, range.endOffset);
  return { text: target.textContent ?? "", start, end: prefix.toString().length };
}

function pairCommittedQuotes(target: HTMLElement, edit: Edit) {
  if (!isTextControl(target) && !target.isContentEditable) return false;
  const text = isTextControl(target) ? target.value : target.textContent ?? "";
  const before = edit.text.slice(0, edit.start), after = edit.text.slice(edit.end);
  const end = text.length - after.length;
  if (!text.startsWith(before) || !text.endsWith(after)) return false;
  const inserted = text.slice(edit.start, end);
  if (!/^[“”]+$/u.test(inserted)) return false;

  // 已在空引号对中间时，吸收输入法随后提交的引号，保留原来的一对。
  const replacement = edit.start === edit.end && before.endsWith(pair[0]) && after.startsWith(pair[1]) ? "" : pair;
  const caretOffset = replacement ? 1 : 0;
  const changed = inserted !== replacement;
  if (isTextControl(target)) {
    if (changed) {
      // 使用原生 setter，让 React 在 input 时读取并保存修正后的值。
      const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(target, before + replacement + after);
    }
    try { target.setSelectionRange(edit.start + caretOffset, edit.start + caretOffset); }
    catch { /* 输入类型可能在组字期间改变。 */ }
    return changed;
  }

  // 只改本次插入的文本节点，保留换行和 @ 引用元素。
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let caretNode: Text | undefined;
  let caret = 0;
  for (let node = walker.nextNode() as Text | null; node && offset < end; node = walker.nextNode() as Text | null) {
    const next = offset + node.length;
    if (next > edit.start) {
      const start = Math.max(0, edit.start - offset);
      if (changed) node.replaceData(start, Math.min(end, next) - offset - start, caretNode ? "" : replacement);
      if (!caretNode) {
        caretNode = node;
        caret = start + caretOffset;
      }
    }
    offset = next;
  }
  if (caretNode && document.activeElement === target) window.getSelection()?.collapse(caretNode, caret);
  return changed;
}

export function useAutoPairQuotes() {
  useEffect(() => {
    const edits = new WeakMap<HTMLElement, Edit>();
    const compositions = new WeakMap<HTMLElement, Edit>();

    const beforeInput = (event: Event) => {
      const { target, inputType, isComposing } = event as InputEvent;
      if (!(target instanceof HTMLElement)) return;
      edits.delete(target);
      if (isComposing || compositions.has(target) || !["", "insertText", "insertCompositionText", "insertFromComposition", "insertReplacementText"].includes(inputType)) return;
      const edit = readEdit(target);
      if (edit) edits.set(target, edit);
    };
    const input = (event: Event) => {
      const { target, isComposing } = event as InputEvent;
      if (!(target instanceof HTMLElement) || isComposing || compositions.has(target)) return;
      const edit = edits.get(target);
      edits.delete(target);
      // 捕获阶段先修正 DOM，让 React 只读到最终值；不依赖 input.data 或输入后的光标位置。
      if (edit) pairCommittedQuotes(target, edit);
    };
    const compositionStart = ({ target }: CompositionEvent) => {
      if (!(target instanceof HTMLElement)) return;
      edits.delete(target);
      const edit = readEdit(target);
      if (edit) compositions.set(target, edit);
    };
    const compositionEnd = ({ target }: CompositionEvent) => {
      if (!(target instanceof HTMLElement)) return;
      const edit = compositions.get(target);
      compositions.delete(target);
      if (edit && pairCommittedQuotes(target, edit)) target.dispatchEvent(new Event("input", { bubbles: true }));
    };

    window.addEventListener("beforeinput", beforeInput, true);
    window.addEventListener("input", input, true);
    window.addEventListener("compositionstart", compositionStart, true);
    window.addEventListener("compositionend", compositionEnd, true);
    return () => {
      window.removeEventListener("beforeinput", beforeInput, true);
      window.removeEventListener("input", input, true);
      window.removeEventListener("compositionstart", compositionStart, true);
      window.removeEventListener("compositionend", compositionEnd, true);
    };
  }, []);
}
