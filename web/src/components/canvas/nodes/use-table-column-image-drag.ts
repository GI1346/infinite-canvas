import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { reorderArray } from "@/lib/canvas/dxos-table";

export function useTableColumnImageDrag() {
    const tableRef = useRef<HTMLTableElement>(null);
    const cancelDrag = useRef<() => void>(undefined);
    const suppressClick = useRef(false);
    useEffect(() => () => cancelDrag.current?.(), []);

    function start(event: PointerEvent<HTMLButtonElement>, inputId: string, rowIndex: number, ids: string[], itemKey: string, commit: (ordered: string[]) => void) {
        event.stopPropagation();
        if (event.button !== 0) return;
        cancelDrag.current?.();
        suppressClick.current = false;
        const table = tableRef.current, source = event.currentTarget.closest<HTMLElement>("[data-table-cell-image]");
        const fromIndex = ids.indexOf(itemKey);
        if (!table || !source || fromIndex < 0 || ids.length < 2) return;
        const { pointerId, clientX: startX, clientY: startY } = event;
        const controller = new AbortController();
        let ghost: HTMLImageElement | undefined, target: HTMLTableCellElement | undefined;
        const reset = () => {
            controller.abort();
            target?.removeAttribute("data-table-column-insertion");
            source.removeAttribute("data-table-image-dragging");
            if (ghost) document.body.removeAttribute("data-table-column-drag");
            ghost?.remove();
            cancelDrag.current = undefined;
        };
        const hit = ({ clientX, clientY }: globalThis.PointerEvent) => {
            const cell = document.elementFromPoint(clientX, clientY)?.closest<HTMLTableCellElement>("td[data-table-input-id]");
            if (!cell || !table.contains(cell) || cell.dataset.tableInputId !== inputId || Number(cell.dataset.tableRowIndex) === rowIndex || !cell.dataset.tableOrderSlots) return;
            const slots = cell.dataset.tableOrderSlots.split(",").map(Number);
            const rect = cell.getBoundingClientRect(), after = clientY >= rect.top + rect.height / 2;
            return { cell, after, slot: slots[after ? slots.length - 1 : 0] + Number(after) };
        };
        const move = (next: globalThis.PointerEvent) => {
            if (next.pointerId !== pointerId) return;
            if (!ghost) {
                if (Math.hypot(next.clientX - startX, next.clientY - startY) < 5) return;
                suppressClick.current = true;
                source.dataset.tableImageDragging = "";
                document.body.dataset.tableColumnDrag = "";
                ghost = document.createElement("img");
                ghost.src = source.querySelector("img")?.currentSrc || "";
                ghost.alt = "";
                ghost.setAttribute("aria-hidden", "true");
                ghost.setAttribute("data-table-image-ghost", "");
                ghost.className = "pointer-events-none fixed left-0 top-0 z-[2000] size-14 rounded-lg border border-[#0ea977]/60 bg-background object-cover opacity-75 shadow-lg dark:border-[#37d39b]/60";
                document.body.append(ghost);
            }
            next.preventDefault();
            ghost.style.transform = `translate3d(${next.clientX + 12}px, ${next.clientY + 12}px, 0)`;
            const nextTarget = hit(next);
            if (target !== nextTarget?.cell) target?.removeAttribute("data-table-column-insertion");
            target = nextTarget?.cell;
            if (target && nextTarget) target.dataset.tableColumnInsertion = nextTarget.after ? "after" : "before";
        };
        const finish = (next: globalThis.PointerEvent) => {
            if (next.pointerId !== pointerId) return;
            const drop = ghost && next.type === "pointerup" ? hit(next) : undefined;
            reset();
            if (drop) {
                const ordered = reorderArray(ids, fromIndex, drop.slot - Number(fromIndex < drop.slot));
                if (ordered !== ids) commit(ordered);
            }
        };
        cancelDrag.current = reset;
        const options = { signal: controller.signal, capture: true };
        window.addEventListener("pointermove", move, { ...options, passive: false });
        window.addEventListener("pointerup", finish, options);
        window.addEventListener("pointercancel", finish, options);
        window.addEventListener("blur", reset, options);
    }

    function clickCapture(event: MouseEvent) {
        if (!suppressClick.current || event.detail === 0) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
    }
    return { tableRef, start, clickCapture, resetClick: () => { suppressClick.current = false; } };
}
