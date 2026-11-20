/** 用于跳表和出图后的定格显示。 */
export function formatGenerationDuration(durationMs?: number | null): string | null {
    if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return null;
    const totalSeconds = durationMs / 1000;
    if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
    const rounded = Math.round(totalSeconds);
    return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
}

export function startImageGenerationTiming(startedAt: number) {
    return { generationStartedAt: startedAt, generationDurationMs: undefined };
}

export function finishImageGenerationTiming(startedAt?: number) {
    return { generationStartedAt: undefined, generationDurationMs: startedAt === undefined ? undefined : Math.max(0, Date.now() - startedAt) };
}
