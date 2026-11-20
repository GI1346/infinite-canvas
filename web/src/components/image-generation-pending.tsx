import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatGenerationDuration } from "@/lib/generation-timer";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { cn } from "@/lib/utils";

export function LiveGenerationTimer({ startedAt }: { startedAt?: number }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [elapsed, setElapsed] = useState(() => startedAt === undefined ? 0 : Math.max(0, Date.now() - startedAt));
    useEffect(() => {
        const base = startedAt ?? Date.now();
        const update = () => setElapsed(Math.max(0, Date.now() - base));
        update();
        const timer = window.setInterval(update, 100);
        return () => window.clearInterval(timer);
    }, [startedAt]);
    return <span data-generation-timer className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums" style={{ borderColor: theme.accent.soft, background: theme.accent.soft, color: theme.toolbar.activeText }}>
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current motion-safe:animate-pulse" /><span>{formatGenerationDuration(elapsed) ?? "0.0s"}</span>
    </span>;
}

export function ImageGenerationPending({ className, label, compact = false, startedAt }: { className?: string; label?: string; compact?: boolean; startedAt?: number }) {
    const { t } = useTranslation();
    const [tick, setTick] = useState(0);
    const pendingMessages = t("generation.pending", { returnObjects: true }) as string[];

    useEffect(() => {
        const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const index = Math.floor(tick / 2) % pendingMessages.length;
    const progress = Math.min(98, 10 + (1 - Math.exp(-tick / 28)) * 88);

    return (
        <div className={cn("relative overflow-hidden bg-[#0ea977]/[0.05] dark:bg-[#0ea977]/[0.08]", compact ? "min-h-24" : "aspect-[4/3]", className)}>
            <div
                className="absolute inset-0 opacity-60"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(14,169,119,0.32) 1.4px, transparent 1.6px)",
                    backgroundSize: "16px 16px",
                    maskImage: "radial-gradient(ellipse at 38% 68%, black 0%, black 28%, transparent 60%)",
                }}
            />
            <div className="absolute left-4 top-4 flex items-center gap-2 text-[15px] font-medium text-[#0ea977] dark:text-[#37d39b]">
                <LoaderCircle className="size-4 animate-spin" />
                <span>{label || pendingMessages[index]}</span>
            </div>
            <div className="absolute inset-0 grid place-items-center"><LiveGenerationTimer startedAt={startedAt} /></div>
            <div className="absolute bottom-4 left-4 right-4">
                <div className="mb-2 flex items-center justify-between font-mono text-xs font-semibold">
                    <span />
                    <span className="text-[#0ea977] dark:text-[#37d39b]">{Math.floor(progress)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#0ea977]/15 dark:bg-[#37d39b]/20">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#0ea977] to-[#37d39b] transition-[width] duration-500" style={{ width: `${progress}%` }} />
                </div>
            </div>
        </div>
    );
}
