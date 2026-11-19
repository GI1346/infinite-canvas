import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { BetweenHorizontalStart, Clipboard, ClipboardPaste, Copy, CopyPlus, Download, Drama, GalleryHorizontal, GalleryHorizontalEnd, Group, Image as ImageIcon, Trash2, Ungroup } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ContextMenuState } from "@/types/canvas";
import type { VideoFramePosition } from "@/lib/canvas/canvas-video-frame";

type NodeActions = {
    download?: () => void;
    copyNode: () => void;
    copyImage?: () => void;
    paste: () => void;
    copyContent: () => void;
};

export function CanvasNodeContextMenu({ menu, canCaptureVideoFrame, onCreateCharacterRecipe, canGroup, canUngroup, onClose, onCaptureVideoFrame, onDuplicate, onGroup, onUngroup, onDelete, actions }: { menu: ContextMenuState; canCaptureVideoFrame: boolean; onCreateCharacterRecipe?: () => void; canGroup?: boolean; canUngroup?: boolean; onClose: () => void; onCaptureVideoFrame: (position: VideoFramePosition) => void; onDuplicate: () => void; onGroup?: () => void; onUngroup?: () => void; onDelete: () => void; actions?: NodeActions }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const ref = useRef<HTMLDivElement>(null);
    const modifier = navigator.platform.includes("Mac") ? "⌘" : "Ctrl+";

    useLayoutEffect(() => {
        if (!ref.current) return;
        ref.current.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - ref.current.offsetWidth - 8))}px`;
        ref.current.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - ref.current.offsetHeight - 8))}px`;
    }, [menu]);

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && (ref.current?.contains(target) || target.closest(".ant-popover"))) return;
            onClose();
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [onClose]);

    return (
        <div
            ref={ref}
            data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore
            className="bf-canvas-glass thin-scrollbar fixed z-[80] max-h-[calc(100dvh-16px)] min-w-48 overflow-y-auto rounded-2xl border p-1 shadow-2xl"
            style={{ left: menu.x, top: menu.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
        >
            {onCreateCharacterRecipe && <MenuButton icon={<Drama size={16} />} label="角色三合一合成" onClick={onCreateCharacterRecipe} />}
            {canCaptureVideoFrame ? (
                <>
                    <MenuButton icon={<BetweenHorizontalStart size={16} />} label={t("canvas.videoFrames.first")} onClick={() => onCaptureVideoFrame("first")} />
                    <MenuButton icon={<GalleryHorizontalEnd size={16} />} label={t("canvas.videoFrames.last")} onClick={() => onCaptureVideoFrame("last")} />
                    <MenuButton icon={<GalleryHorizontal size={16} />} label={t("canvas.videoFrames.current")} onClick={() => onCaptureVideoFrame("current")} />
                    <div className="my-1 border-t" style={{ borderColor: theme.toolbar.border }} />
                </>
            ) : null}
            {menu.type === "node" && canGroup ? <MenuButton icon={<Group size={16} />} label={t("canvas.nodeToolbar.group")} onClick={onGroup} /> : null}
            {menu.type === "node" && canUngroup ? <MenuButton icon={<Ungroup size={16} />} label={t("canvas.nodeToolbar.ungroup")} onClick={onUngroup} /> : null}
            {actions?.download && <MenuButton icon={<Download size={16} />} label="下载" onClick={actions.download} />}
            {actions && <MenuButton icon={<Copy size={16} />} label="复制节点" shortcut={`${modifier}C`} onClick={actions.copyNode} />}
            {actions?.copyImage && <MenuButton icon={<ImageIcon size={16} />} label="复制图片" onClick={actions.copyImage} />}
            {menu.type === "node" ? <MenuButton icon={<CopyPlus size={16} />} label={actions ? "创建副本" : t("canvas.controls.duplicate")} shortcut={actions ? `${modifier}D` : undefined} onClick={onDuplicate} /> : null}
            {actions && <MenuButton icon={<ClipboardPaste size={16} />} label="粘贴" shortcut={`${modifier}V`} onClick={actions.paste} />}
            <MenuButton icon={<Trash2 size={16} />} label={t("canvas.controls.delete")} shortcut={actions ? "Del" : undefined} onClick={onDelete} danger />
            {actions && <>
                <div className="my-1 border-t" style={{ borderColor: theme.toolbar.border }} />
                <MenuButton icon={<Clipboard size={16} />} label="复制到剪贴板" onClick={actions.copyContent} />
            </>}
        </div>
    );
}

function MenuButton({ icon, label, shortcut, onClick, danger = false }: { icon: ReactNode; label: string; shortcut?: string; onClick?: () => void; danger?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-[#0ea977]/[0.08] dark:hover:bg-[#37d39b]/[0.12]" style={{ color: danger ? "#f87171" : theme.node.text }} onClick={onClick}>
            {icon}
            <span>{label}</span>
            {shortcut && <kbd aria-hidden="true" className="ml-auto pl-4 text-[11px]" style={{ color: theme.node.muted }}>{shortcut}</kbd>}
        </button>
    );
}
