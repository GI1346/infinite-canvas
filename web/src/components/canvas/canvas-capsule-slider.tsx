import type { ReactNode } from "react";
import type { CanvasTheme } from "@/lib/canvas-theme";

export type CapsuleSliderStop = { value: number; label: string };

export function CapsuleSlider({
    theme,
    title,
    valueLabel,
    preview,
    min,
    max,
    value,
    ariaLabel,
    stops,
    disabled,
    wrapStops,
    onChange,
}: {
    theme: CanvasTheme;
    title: string;
    valueLabel: string;
    preview?: ReactNode;
    min: number;
    max: number;
    value: number;
    ariaLabel: string;
    stops: CapsuleSliderStop[];
    disabled?: boolean;
    wrapStops?: boolean;
    onChange: (value: number) => void;
}) {
    const span = Math.max(1, max - min);
    const pct = Math.max(0, Math.min(100, ((value - min) / span) * 100));

    return (
        <div className={`space-y-2 ${disabled ? "pointer-events-none opacity-45" : ""}`}>
            <div className="flex items-center justify-between text-xs">
                <span className="font-medium" style={{ color: theme.node.muted }}>
                    {title}
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold" style={{ color: theme.accent.base }}>
                    {preview}
                    <span>{valueLabel}</span>
                </span>
            </div>
            <div
                className="relative h-8 w-full overflow-hidden rounded-xl border"
                style={{ borderColor: theme.glass.insetBorder, background: theme.glass.inset }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div
                    className="pointer-events-none absolute inset-y-0 left-0 rounded-r-lg transition-[width] duration-75"
                    style={{ width: `max(18px, ${pct}%)`, background: theme.accent.soft }}
                >
                    <span
                        className="absolute top-1/2 right-1.5 h-4 w-1 -translate-y-1/2 rounded-full shadow-xs"
                        style={{ background: theme.accent.base }}
                    />
                </div>
                <input
                    type="range"
                    aria-label={ariaLabel}
                    disabled={disabled}
                    min={min}
                    max={max}
                    step={1}
                    value={value}
                    className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                    onMouseDown={(event) => event.stopPropagation()}
                    onChange={(event) => onChange(Number(event.target.value))}
                />
            </div>
            <div className={wrapStops ? "flex flex-wrap items-center gap-1 font-mono text-[10px]" : "flex items-center justify-between gap-1 font-mono text-[10px]"}>
                {stops.map((stop) => {
                    const active = stop.value === value;
                    return (
                        <button
                            key={stop.value}
                            type="button"
                            aria-pressed={active}
                            disabled={disabled}
                            className="cursor-pointer rounded-md px-1.5 py-0.5 transition hover:opacity-100"
                            style={{
                                background: active ? theme.accent.soft : "transparent",
                                color: active ? theme.accent.base : theme.node.muted,
                                fontWeight: active ? 700 : 500,
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={() => onChange(stop.value)}
                        >
                            {stop.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
