import { useEffect, useMemo, useRef, useState } from "react";
import { Aperture, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleArrowDown, CircleEllipsis, Contrast, GripVertical, Pencil, PieChart, Palette, Image as ImageIcon, Plus, RotateCcw, X } from "lucide-react";
import { Modal } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { cameraSections, colorPresets, stylePresets, CAMERA_FILTERS, CAMERA_ZOOM, CAMERA_APERTURE_FILTER, extractPaletteColors, customPalettePrompt } from "@/lib/canvas/canvas-image-presets";

type PickerTab = "camera" | "palette" | "style";
export type StyleSelections = { camera: Record<string, string>; palette: string; style: string };
export type CustomPalette = { value: string; name: string; colors: string[]; prompt: string };

type Props = {
    selections: StyleSelections;
    onSelect: (selections: StyleSelections) => void;
    customPalettes: CustomPalette[];
    onCustomPalettesChange: (list: CustomPalette[]) => void;
    theme: CanvasTheme;
};

const ACCENT = "#4b8bff";
const MAIN_HEIGHT = 88;
const SIDE_HEIGHT = 52;

const EMPTY: StyleSelections = { camera: {}, palette: "", style: "" };

/** 图片节点下方的「相机 / 配色 / 风格」参数条：选择结果保存在节点参数里，生成时注入提示词。 */
export function CanvasStylePicker({ selections, onSelect, customPalettes, onCustomPalettesChange, theme }: Props) {
    const [collapsed, setCollapsed] = useState(false);
    const [tab, setTab] = useState<PickerTab | null>(null);
    const [temp, setTemp] = useState<StyleSelections | null>(null);

    const selectedCamera = useMemo(() => cameraSections.map((section) => selections.camera[section.key] ?? "自动"), [selections.camera]);
    const cameraSummary = selectedCamera.filter((value) => value !== "自动").join(", ");
    // 三个格子各配一张缩略图（对齐即梦）：相机用预览图，配色用色卡图，风格用短片首帧。
    // 胶囊缩略图用实景图，别用图标：相机跟机身风格、配色跟所选色卡、风格跟短片首帧。
    const cameraThumb = <img src="/presets/base-a.jpg" alt="" className="size-full object-cover" style={{ filter: selections.camera.body === "黑白纪实" ? "grayscale(1) contrast(1.05)" : undefined }} />;
    const paletteItem = colorPresets.find((item) => item.value === selections.palette) ?? customPalettes.find((item) => item.value === selections.palette);
    const paletteColors = paletteItem?.colors?.length ? paletteItem.colors : colorPresets[0]?.colors ?? ["#8a8a8a"];
    const paletteThumb = paletteItem && "photo" in paletteItem && paletteItem.photo
        ? <img src={paletteItem.photo} alt="" className="size-full object-cover" />
        : paletteItem
            ? <span className="block size-full" style={{ background: `linear-gradient(120deg, ${paletteColors.join(", ")})` }} />
            : <img src={colorPresets[0]?.photo ?? "/presets/base-a.jpg"} alt="" className="size-full object-cover" />;
    const paletteLabel = customPalettes.find((item) => item.value === selections.palette)?.name ?? (colorPresets.some((item) => item.value === selections.palette) ? selections.palette : "");
    const styleItem = stylePresets.find((item) => item.value === selections.style) ?? stylePresets[0];
    const styleThumb = styleItem?.photo?.endsWith(".mp4")
        ? <video src={`${styleItem.photo}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover" />
        : <img src={styleItem?.photo ?? "/presets/base-a.jpg"} alt="" className="size-full object-cover" />;

    const open = (next: PickerTab) => {
        setTemp({
            camera: Object.fromEntries(cameraSections.map((section) => [section.key, selections.camera[section.key] ?? "自动"])),
            palette: selections.palette,
            style: selections.style,
        });
        setTab(next);
    };
    const confirm = () => {
        if (temp) onSelect(temp);
        setTab(null);
    };
    const resetAll = () => setTemp({ camera: Object.fromEntries(cameraSections.map((section) => [section.key, "自动"])), palette: "", style: "" });

    return (
        <div className="flex items-center gap-1.5">
            {collapsed ? (
                <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full border transition hover:opacity-80" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => setCollapsed(false)} aria-label="展开相机 / 配色 / 风格">
                    <Aperture size={15} />
                </button>
            ) : (
                <>
                    <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-xl border" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                        <Segment theme={theme} thumb={cameraThumb} label="相机" value={cameraSummary} onClick={() => open("camera")} />
                        <span className="my-2 w-px shrink-0" style={{ background: theme.node.stroke }} />
                        <Segment theme={theme} thumb={paletteThumb} label="配色" value={paletteLabel} onClick={() => open("palette")} />
                        <span className="my-2 w-px shrink-0" style={{ background: theme.node.stroke }} />
                        <Segment theme={theme} thumb={styleThumb} label="风格" value={selections.style} onClick={() => open("style")} />
                    </div>
                    <button type="button" className="grid size-9 shrink-0 place-items-center rounded-lg transition hover:opacity-80" style={{ color: theme.node.muted }} onClick={() => setCollapsed(true)} aria-label="收起预设">
                        <ChevronDown size={16} />
                    </button>
                </>
            )}

            {tab && temp ? (
                <Modal
                    open
                    centered
                    destroyOnHidden
                    width={tab === "style" ? 820 : 800}
                    onCancel={() => setTab(null)}
                    footer={null}
                    closable={false}
                    style={{ background: theme.node.panel, padding: 0, borderRadius: 20, overflow: "hidden" }}
                    styles={{ body: { padding: 0 }, mask: { background: theme.canvas.background === "#0d0d0d" ? "rgba(0,0,0,.55)" : "rgba(0,0,0,.28)" } }}
                >
                    <div className="flex max-h-[80vh] flex-col">
                        <div className="flex items-center justify-between px-5 pt-4">
                            <span className="text-[13px] font-medium" style={{ color: theme.node.text }}>{tab === "camera" ? "相机" : tab === "palette" ? "配色" : "风格"}</span>
                            <div className="flex items-center gap-4">
                                <button type="button" className="flex items-center gap-1 text-[12px] opacity-70 hover:opacity-100" style={{ color: theme.node.text }} onClick={resetAll}>
                                    <RotateCcw size={13} />全部重置
                                </button>
                                <button type="button" className="grid size-6 place-items-center rounded-md opacity-70 hover:opacity-100" style={{ color: theme.node.text }} onClick={() => setTab(null)} aria-label="关闭">
                                    <X size={15} />
                                </button>
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                            {tab === "camera" ? <CameraWheel theme={theme} temp={temp} setTemp={setTemp} /> : null}
                            {tab === "palette" ? <PalettePanel theme={theme} temp={temp} setTemp={setTemp} customPalettes={customPalettes} onCustomPalettesChange={onCustomPalettesChange} /> : null}
                            {tab === "style" ? <StylePanel theme={theme} temp={temp} setTemp={setTemp} /> : null}
                        </div>
                        <div className="flex justify-end px-5 pb-4">
                            <button type="button" className="h-8 rounded-lg px-4 text-[13px] font-medium transition hover:opacity-90" style={{ background: theme.accent.base, color: theme.canvas.background === "#0d0d0d" ? "#0d0d0d" : "#ffffff" }} onClick={confirm}>
                                确认
                            </button>
                        </div>
                    </div>
                </Modal>
            ) : null}
        </div>
    );
}

/** 预设胶囊的一格：左边缩略图、右边「名称 + 已选值」，和即梦一致。 */
function Segment({ theme, thumb, label, value, onClick }: { theme: CanvasTheme; thumb: React.ReactNode; label: string; value: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className="flex h-10 min-w-0 flex-1 items-center gap-2 px-2.5 text-left transition hover:opacity-85"
            onClick={onClick}
        >
            <span className="relative size-[22px] shrink-0 overflow-hidden rounded-[6px]" style={{ boxShadow: `inset 0 0 0 1px ${theme.node.stroke}` }}>
                {thumb}
            </span>
            <span className="flex min-w-0 flex-1 items-baseline gap-1">
                <span className="shrink-0 text-[13px]" style={{ color: value ? theme.accent.base : theme.node.text }}>{label}</span>
                {value ? <span className="truncate text-[11px]" style={{ color: theme.node.muted }}>{value}</span> : null}
            </span>
        </button>
    );
}

/** 相机弹窗：16:9 预览实时变化，四列滚动选择（箭头 / 滚轮 / 拖拽 / 点击均可换挡）。 */
function CameraWheel({ theme, temp, setTemp }: { theme: CanvasTheme; temp: StyleSelections; setTemp: (next: StyleSelections) => void }) {
    const lastWheel = useRef(0);
    const dragState = useRef<{ y: number; key: string } | null>(null);
    const setValue = (key: string, value: string) => setTemp({ ...temp, camera: { ...temp.camera, [key]: value } });

    const previewFilter = cameraSections
        .map((section) => {
            const value = temp.camera[section.key];
            return [CAMERA_FILTERS[value], CAMERA_APERTURE_FILTER[value]].filter(Boolean).join(" ");
        })
        .filter(Boolean)
        .join(" ");
    const focal = temp.camera.focal ?? "24mm";
    const zoom = CAMERA_ZOOM[focal] ?? 1;
    const mono = temp.camera.body === "黑白纪实";

    return (
        <div className="space-y-5">
            <div className="mx-auto aspect-video w-[340px] overflow-hidden rounded-lg bg-[#101010]">
                <img src="/presets/base-a.jpg" alt="相机效果预览" className="h-full w-full object-cover" style={{ filter: [previewFilter, mono ? "grayscale(1)" : ""].filter(Boolean).join(" ") || undefined, transform: `scale(${zoom})` }} />
            </div>
            <div className="grid grid-cols-4 gap-3">
                {cameraSections.map((section) => {
                    const index = Math.max(0, section.options.findIndex((option) => option.value === (temp.camera[section.key] ?? "自动")));
                    const step = (direction: 1 | -1) => {
                        const next = Math.min(section.options.length - 1, Math.max(0, index + direction));
                        setValue(section.key, section.options[next].value);
                    };
                    const onWheel = (event: React.WheelEvent) => {
                        event.preventDefault();
                        const now = Date.now();
                        if (now - lastWheel.current < 90) return;
                        lastWheel.current = now;
                        step(event.deltaY > 0 ? 1 : -1);
                    };
                    const arrowButton = (direction: 1 | -1) => {
                        const disabled = direction === -1 ? index <= 0 : index >= section.options.length - 1;
                        return (
                            <button
                                type="button"
                                className="mx-auto flex h-6 w-10 items-center justify-center rounded-lg transition disabled:opacity-25"
                                style={{ background: theme.node.fill, color: theme.node.text }}
                                disabled={disabled}
                                onClick={() => step(direction)}
                                aria-label={direction === -1 ? "上一项" : "下一项"}
                            >
                                {direction === -1 ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                        );
                    };
                    const item = (offset: -1 | 0 | 1) => {
                        const option = section.options[index + offset];
                        if (!option) return <div style={{ height: offset === 0 ? MAIN_HEIGHT : SIDE_HEIGHT }} />;
                        const selected = offset === 0;
                        return (
                            <button
                                type="button"
                                className="relative w-full overflow-hidden rounded-xl border transition hover:opacity-95"
                                style={{
                                    height: selected ? MAIN_HEIGHT : SIDE_HEIGHT,
                                    borderColor: selected ? theme.node.text : "transparent",
                                    background: selected ? theme.node.fill : theme.glass.inset,
                                    opacity: selected ? 1 : Math.max(0.32, 1 - Math.abs(offset) * 0.42),
                                    transform: `scale(${selected ? 1 : 0.94})`,
                                }}
                                onClick={() => setValue(section.key, option.value)}
                                title={option.value}
                            >
                                <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-1">
                                    {option.photo ? <img src={option.photo} alt={option.value} className="size-8 shrink-0 rounded-md object-cover" /> : null}
                                    {section.key === "focal" && option.value !== "自动" ? (
                                        <span className="text-lg leading-none" style={{ color: theme.node.text }}>{option.value.replace("mm", "")}<span className="ml-0.5 text-[10px] opacity-60">mm</span></span>
                                    ) : (
                                        <span className="max-w-[130px] truncate text-[12px]" style={{ color: theme.node.text }}>{option.value}</span>
                                    )}
                                </span>
                            </button>
                        );
                    };
                    return (
                        <div key={section.key} className="space-y-1.5">
                            <div className="text-center text-[12px]" style={{ color: theme.node.muted }}>{section.label}</div>
                            <div className="flex justify-center">{arrowButton(-1)}</div>
                            <div
                                className="relative"
                                style={{ height: SIDE_HEIGHT * 2 + MAIN_HEIGHT + 8 }}
                                onWheel={onWheel}
                                onPointerDown={(event) => { dragState.current = { y: event.clientY, key: section.key }; (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId); }}
                                onPointerMove={(event) => {
                                    if (dragState.current?.key !== section.key) return;
                                    if (Math.abs(event.clientY - dragState.current.y) > 44) {
                                        step(event.clientY < dragState.current.y ? 1 : -1);
                                        dragState.current.y = event.clientY;
                                    }
                                }}
                                onPointerUp={() => { dragState.current = null; }}
                            >
                                {item(-1)}
                                {item(0)}
                                {item(1)}
                            </div>
                            <div className="flex justify-center">{arrowButton(1)}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function SectionIcon({ sectionKey, size }: { sectionKey: string; size: number }) {
    if (sectionKey === "aperture") return <span className="grid size-4 place-items-center rounded-full border-2 border-current opacity-90" />;
    return <Aperture size={size} className="opacity-90" />;
}

/** 配色弹窗：每个色调一张专属 16:9 人物图 + 5 色点；「创建配色」支持从图片取色和色轮自选。 */
function PalettePanel({ theme, temp, setTemp, customPalettes, onCustomPalettesChange }: { theme: CanvasTheme; temp: StyleSelections; setTemp: (next: StyleSelections) => void; customPalettes: CustomPalette[]; onCustomPalettesChange: (list: CustomPalette[]) => void }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const addCustom = (name: string, colors: string[]) => {
        const palette: CustomPalette = { value: `custom:${name}-${Date.now()}`, name, colors, prompt: customPalettePrompt(name, colors) };
        onCustomPalettesChange([...customPalettes, palette]);
        setTemp({ ...temp, palette: palette.value });
        setMenuOpen(false);
    };
    const handleFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                const size = 64;
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const context = canvas.getContext("2d");
                if (!context) return;
                context.drawImage(image, 0, 0, size, size);
                const colors = extractPaletteColors(context.getImageData(0, 0, size, size).data, size);
                addCustom(file.name.replace(/\.[^.]+$/, "").slice(0, 16) || "图片配色", colors.length >= 2 ? colors : ["#808080"]);
            };
            image.src = String(reader.result);
        };
        reader.readAsDataURL(file);
    };
    const removeCustom = (value: string) => {
        onCustomPalettesChange(customPalettes.filter((item) => item.value !== value));
        if (temp.palette === value) setTemp({ ...temp, palette: "" });
    };

    const card = (name: string, selected: boolean, colors: string[], thumb: React.ReactNode, onPick: () => void, extra?: React.ReactNode) => (
        <div key={name} className="group/tile space-y-1.5">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg" style={{ boxShadow: selected ? `0 0 0 2px ${theme.accent.base}` : `inset 0 0 0 1px ${theme.node.stroke}` }}>
                <button type="button" className="block size-full" onClick={onPick} aria-label={name}>
                    {thumb}
                </button>
                {/* 色点压在图片底部，和即梦一致 */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 px-2 py-1" style={{ background: "rgba(12,12,12,.42)" }}>
                    {colors.slice(0, 7).map((color, index) => <span key={`${color}-${index}`} className="size-1.5 rounded-full" style={{ background: color }} />)}
                </div>
                {extra}
            </div>
            <div className="truncate px-0.5 text-center text-[11px]" style={{ color: selected ? theme.accent.base : theme.node.muted }}>{name}</div>
        </div>
    );

    return (
        <div className="grid grid-cols-4 gap-x-3 gap-y-4">
            <div className="space-y-1.5">
                <div className="relative aspect-video w-full">
                    <button
                        type="button"
                        className="flex size-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed transition hover:opacity-80"
                        style={{ borderColor: theme.node.stroke, color: theme.node.muted, background: theme.glass.inset }}
                        onClick={() => setMenuOpen(!menuOpen)}
                    >
                        <Plus size={16} />
                    </button>
                    {menuOpen ? (
                        <div className="absolute left-0 top-full z-20 mt-1 w-max min-w-full overflow-hidden rounded-lg border py-1 shadow-lg" style={{ background: theme.node.panel, borderColor: theme.node.stroke }} data-canvas-overlay data-canvas-no-zoom>
                            <button type="button" className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-[12px] hover:opacity-70" style={{ color: theme.node.text }} onClick={() => fileRef.current?.click()}>
                                <ImageIcon size={14} />从图片创建
                            </button>
                            <button type="button" className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-[12px] hover:opacity-70" style={{ color: theme.node.text }} onClick={() => { setMenuOpen(false); setEditorOpen(true); }}>
                                <Palette size={14} />自定义配色
                            </button>
                        </div>
                    ) : null}
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) handleFile(file);
                            event.target.value = "";
                        }}
                    />
                </div>
                <div className="truncate px-0.5 text-center text-[11px]" style={{ color: theme.node.muted }}>创建配色</div>
            </div>
            {customPalettes.map((item) => {
                const selected = item.value === temp.palette;
                return card(
                    item.name,
                    selected,
                    item.colors,
                    <span className="block size-full" style={{ background: `linear-gradient(120deg, ${item.colors.join(", ")})` }} />,
                    () => setTemp({ ...temp, palette: selected ? "" : item.value }),
                    <button type="button" className="absolute right-1 top-1 hidden size-5 place-items-center rounded-full bg-black/60 text-white group-hover/tile:grid" onClick={() => removeCustom(item.value)} aria-label={`删除${item.name}`}>
                        <X size={11} />
                    </button>,
                );
            })}
            {colorPresets.map((item) => {
                const selected = item.value === temp.palette;
                return card(
                    item.value,
                    selected,
                    item.colors,
                    <img src={item.photo ?? "/presets/base-a.jpg"} alt={item.value} className="size-full object-cover" />,
                    () => setTemp({ ...temp, palette: selected ? "" : item.value }),
                );
            })}
            <CustomPaletteEditor theme={theme} open={editorOpen} onClose={() => setEditorOpen(false)} count={customPalettes.length} onCreate={addCustom} />
        </div>
    );
}

type WheelColor = { h: number; s: number; v: number };
type PaletteMode = "custom" | "analog" | "complement" | "triad";

/** 取色模式：自定义自由取色，其余按主色色相派生（就近 / 互补 / 三等分）。 */
const PALETTE_MODES: { key: PaletteMode; label: string; offsets: number[] | null; icon: React.ReactNode }[] = [
    { key: "custom", label: "自定义取色", offsets: null, icon: <CircleEllipsis size={17} /> },
    { key: "analog", label: "临近色取色", offsets: [0, 36, -36, 68, -68], icon: <CircleArrowDown size={17} /> },
    { key: "complement", label: "互补色", offsets: [0, 180], icon: <Contrast size={17} /> },
    { key: "triad", label: "三等分取色", offsets: [0, 120, 240], icon: <PieChart size={17} /> },
];
const WHEEL_SIZE = 226;
const PALETTE_MAX = 9;
const DEFAULT_COLORS: WheelColor[] = [
    { h: 210, s: 0.68, v: 1 },
    { h: 250, s: 0.62, v: 1 },
    { h: 186, s: 0.72, v: 1 },
    { h: 274, s: 0.64, v: 1 },
    { h: 152, s: 0.7, v: 1 },
];

function hsvToHex(h: number, s: number, v: number) {
    const c = v * s;
    const hp = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const rgb = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
    const m = v - c;
    return `#${rgb.map((n) => Math.round((n + m) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** 按主色色相 + 模式派生整套颜色：模式给出的偏移量之外的格子用更深的同色相补齐。 */
function buildPalette(mode: PaletteMode, hue: number, sat: number, count: number): WheelColor[] {
    const offsets = PALETTE_MODES.find((item) => item.key === mode)?.offsets ?? [0];
    return Array.from({ length: count }, (_, index) => {
        const extra = index >= offsets.length;
        return {
            h: (((hue + offsets[index % offsets.length]) % 360) + 360) % 360,
            s: extra ? sat * 0.78 : sat,
            v: extra ? 0.55 : 1,
        };
    });
}

/** 自定义配色编辑器：对齐即梦——顶部取色模式、色轮上的彩色手柄点、主色大格 + 色卡网格 + 「+」与空白占位。 */
function CustomPaletteEditor({ theme, open, onClose, count, onCreate }: { theme: CanvasTheme; open: boolean; onClose: () => void; count: number; onCreate: (name: string, colors: string[]) => void }) {
    const onDark = theme.canvas.background === "#0d0d0d";
    const [name, setName] = useState("");
    const [mode, setMode] = useState<PaletteMode>("custom");
    const [colors, setColors] = useState<WheelColor[]>(DEFAULT_COLORS);
    const [active, setActive] = useState(0);
    const wheelRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<number | null>(null);

    useEffect(() => {
        if (!open) return;
        setName("");
        setMode("custom");
        setColors(DEFAULT_COLORS);
        setActive(0);
        dragRef.current = null;
    }, [open]);

    const offsets = PALETTE_MODES.find((item) => item.key === mode)?.offsets;
    const handles = offsets ? offsets.map((_, index) => index) : colors.map((_, index) => index);
    const grab = Math.min(active, handles.length - 1);

    const apply = (target: number, hue: number, sat: number) => {
        if (!offsets) {
            setColors((previous) => previous.map((item, index) => (index === target ? { h: hue, s: sat, v: 1 } : item)));
            return;
        }
        setColors(buildPalette(mode, hue - offsets[target % offsets.length], sat, colors.length));
    };
    const pick = (clientX: number, clientY: number) => {
        const rect = wheelRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dx = clientX - rect.left - rect.width / 2;
        const dy = clientY - rect.top - rect.height / 2;
        const target = dragRef.current ?? grab;
        apply(target, ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360, Math.min(1, Math.hypot(dx, dy) / (rect.width / 2)));
    };
    const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        const rect = wheelRef.current?.getBoundingClientRect();
        if (!rect) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const dx = event.clientX - rect.left - rect.width / 2;
        const dy = event.clientY - rect.top - rect.height / 2;
        let nearest = -1;
        let best = 18;
        handles.forEach((index) => {
            const item = colors[index];
            const radius = item.s * (rect.width / 2 - 14);
            const rad = (item.h * Math.PI) / 180;
            const distance = Math.hypot(Math.sin(rad) * radius - dx, -Math.cos(rad) * radius - dy);
            if (distance < best) { best = distance; nearest = index; }
        });
        if (nearest >= 0) { setActive(nearest); dragRef.current = nearest; return; }
        dragRef.current = grab;
        pick(event.clientX, event.clientY);
    };

    const switchMode = (next: PaletteMode) => {
        setMode(next);
        setActive(0);
        const nextOffsets = PALETTE_MODES.find((item) => item.key === next)?.offsets;
        if (nextOffsets) setColors(buildPalette(next, colors[0].h, colors[0].s, colors.length));
    };
    const addColor = () => {
        if (colors.length >= PALETTE_MAX) return;
        const last = colors[colors.length - 1];
        setColors([...colors, { h: (last.h + 24) % 360, s: last.s, v: 1 }]);
        setActive(Math.min(colors.length, handles.length - 1));
    };
    const removeColor = (index: number) => {
        setColors(colors.filter((_, position) => position !== index));
        setActive(0);
    };
    const create = () => {
        if (!colors.length) return;
        onCreate(name.trim() || `未命名配色 ${count + 1}`, colors.map((item) => hsvToHex(item.h, item.s, item.v)));
        onClose();
    };

    const emptyCells = 10 - (colors.length - 1) - (colors.length < PALETTE_MAX ? 1 : 0);
    const shadow = (selected: boolean) => `inset 0 0 0 ${selected ? 2 : 1}px ${selected ? (onDark ? "#ffffff" : theme.node.text) : onDark ? "rgba(255,255,255,.14)" : "rgba(0,0,0,.10)"}`;

    return (
        <Modal open={open} centered width={480} onCancel={onClose} footer={null} closable={false} style={{ background: theme.node.panel, padding: 0, borderRadius: 16, overflow: "hidden" }} styles={{ body: { padding: 0 }, mask: { background: onDark ? "rgba(0,0,0,.45)" : "rgba(0,0,0,.25)" } }}>
            <div data-canvas-overlay data-canvas-no-zoom>
                <div className="flex items-center justify-between">
                    <label className="flex min-w-0 flex-1 cursor-text items-center gap-1.5">
                        <input value={name} onChange={(event) => setName(event.target.value)} placeholder={`未命名配色 ${count + 1}`} className="min-w-0 max-w-[240px] border-0 bg-transparent p-0 text-[13px] outline-none" style={{ color: theme.node.text }} />
                        <Pencil size={13} style={{ color: theme.node.faint }} />
                    </label>
                    <button type="button" className="grid size-6 place-items-center rounded-md opacity-70 hover:opacity-100" style={{ color: theme.node.text }} onClick={onClose} aria-label="关闭自定义配色">
                        <X size={14} />
                    </button>
                </div>

                <div className="pt-4">
                    <div className="mb-4 flex items-center justify-between">
                        <span className="text-[12px]" style={{ color: theme.node.muted }}>{PALETTE_MODES.find((item) => item.key === mode)?.label}</span>
                        <div className="flex items-center gap-0.5 rounded-lg border p-1" style={{ borderColor: theme.node.stroke }}>
                            {PALETTE_MODES.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    className="grid size-7 place-items-center rounded-md transition"
                                    style={{ background: item.key === mode ? theme.glass.inset : "transparent", color: item.key === mode ? theme.node.text : theme.node.muted }}
                                    onClick={() => switchMode(item.key)}
                                    aria-label={item.label}
                                >
                                    {item.icon}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div
                        ref={wheelRef}
                        className="relative mx-auto touch-none rounded-full"
                        style={{
                            width: WHEEL_SIZE,
                            height: WHEEL_SIZE,
                            background: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%), conic-gradient(#ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
                            cursor: "crosshair",
                        }}
                        onPointerDown={startDrag}
                        onPointerMove={(event) => { if (dragRef.current !== null) pick(event.clientX, event.clientY); }}
                        onPointerUp={() => { dragRef.current = null; }}
                        onPointerCancel={() => { dragRef.current = null; }}
                    >
                        {handles.map((index) => {
                            const item = colors[index];
                            const size = index === grab ? 24 : 16;
                            const radius = item.s * (WHEEL_SIZE / 2 - 14);
                            const rad = (item.h * Math.PI) / 180;
                            return (
                                <span
                                    key={index}
                                    className="pointer-events-none absolute rounded-full"
                                    style={{
                                        left: WHEEL_SIZE / 2 + Math.sin(rad) * radius - size / 2,
                                        top: WHEEL_SIZE / 2 - Math.cos(rad) * radius - size / 2,
                                        width: size,
                                        height: size,
                                        background: hsvToHex(item.h, item.s, item.v),
                                        border: `2px solid ${index === grab ? "#fff" : "rgba(255,255,255,.75)"}`,
                                    }}
                                />
                            );
                        })}
                    </div>

                    <div className="mb-2 mt-4 text-[12px]" style={{ color: theme.node.muted }}>{colors.length} 个颜色</div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gridTemplateRows: "55px 55px" }}>
                        <div className="relative" style={{ gridColumn: "1 / span 2", gridRow: "1 / span 2" }}>
                            <button type="button" className="size-full rounded-lg" style={{ background: hsvToHex(colors[0].h, colors[0].s, colors[0].v), boxShadow: shadow(grab === 0) }} onClick={() => setActive(0)} aria-label="主色">
                                <span className="absolute left-2 top-2 flex items-center gap-1 text-[12px]" style={{ color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>
                                    <GripVertical size={12} />主色
                                </span>
                                <span className="absolute bottom-2 left-2 text-[12px]" style={{ color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>{hsvToHex(colors[0].h, colors[0].s, colors[0].v)}</span>
                            </button>
                        </div>
                        {colors.slice(1).map((item, index) => {
                            const position = index + 1;
                            return (
                                <div key={position} className="group relative">
                                    <button type="button" className="size-full rounded-lg" style={{ background: hsvToHex(item.h, item.s, item.v), boxShadow: shadow(grab === position) }} onClick={() => setActive(position)} aria-label={`第 ${position + 1} 个颜色`} />
                                    <button type="button" className="absolute right-1 top-1 hidden size-4 place-items-center rounded-full bg-black/55 text-white group-hover:grid" onClick={() => removeColor(position)} aria-label="删除该颜色">
                                        <X size={10} />
                                    </button>
                                </div>
                            );
                        })}
                        {colors.length < PALETTE_MAX ? (
                            <button type="button" className="grid size-full place-items-center rounded-lg transition hover:brightness-125" style={{ background: theme.glass.inset, color: theme.node.muted }} onClick={addColor} aria-label="添加颜色">
                                <Plus size={16} />
                            </button>
                        ) : null}
                        {Array.from({ length: Math.max(0, emptyCells) }, (_, index) => (
                            <div key={`empty-${index}`} className="rounded-lg" style={{ background: theme.glass.inset }} />
                        ))}
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button type="button" className="h-8 rounded-lg px-4 text-[13px] font-medium transition hover:opacity-90 disabled:opacity-40" style={{ background: theme.accent.base, color: onDark ? "#0d0d0d" : "#ffffff" }} disabled={!colors.length} onClick={create}>
                        创建
                    </button>
                </div>
            </div>
        </Modal>
    );
}

/** 风格弹窗：每项一段 16:9 短片（即梦同款）+ 圆点分页。 */
function StylePanel({ theme, temp, setTemp }: { theme: CanvasTheme; temp: StyleSelections; setTemp: (next: StyleSelections) => void }) {
    const index = Math.max(0, stylePresets.findIndex((item) => item.value === temp.style));
    const current = stylePresets[index];
    const go = (next: number) => setTemp({ ...temp, style: stylePresets[(next + stylePresets.length) % stylePresets.length].value });

    return (
        <div className="space-y-3">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#101010]">
                {current.photo?.endsWith(".mp4") ? (
                    <video key={current.value} src={current.photo} className="h-full w-full object-cover" autoPlay loop muted playsInline aria-label={current.value} />
                ) : (
                    <img key={current.value} src={current.photo ?? "/presets/base-a.jpg"} alt={current.value} className="h-full w-full object-cover" />
                )}
                <button type="button" className="absolute left-3 top-1/2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white" onClick={() => go(index - 1)} aria-label="上一个风格">
                    <ChevronLeft size={15} />
                </button>
                <button type="button" className="absolute right-3 top-1/2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white" onClick={() => go(index + 1)} aria-label="下一个风格">
                    <ChevronRight size={15} />
                </button>
                <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 text-center text-[12px] text-white">{temp.style || current.value}</div>
            </div>
            <div className="flex items-center justify-center gap-1.5">
                {stylePresets.map((item) => (
                    <button
                        key={item.value}
                        type="button"
                        className="size-1.5 rounded-full transition"
                        style={{ background: item.value === temp.style ? theme.node.text : theme.node.stroke, width: item.value === temp.style ? 14 : 6 }}
                        onClick={() => setTemp({ ...temp, style: item.value })}
                        aria-label={item.value}
                    />
                ))}
            </div>
        </div>
    );
}
