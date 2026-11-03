const validCount = value => typeof value === "number" && Number.isFinite(value) && value >= 0;

// Use native conversation totals for cache hits and proxy request timings for throughput.
export function composerUsageMetrics(snapshot, timing) {
  const usage = snapshot?.latestTokenUsageInfo;
  const last = usage?.last;
  const total = usage?.total;
  if (!usage && !timing) return null;
  const cacheHit = validCount(total?.cachedInputTokens) && validCount(total?.inputTokens) && total.inputTokens > 0
    ? Math.min(100, total.cachedInputTokens / total.inputTokens * 100) : null;
  const used = validCount(usage?.contextTokens) ? usage.contextTokens : last?.totalTokens;
  const capacity = usage?.modelContextWindow;
  const contextPercent = validCount(used) && validCount(capacity) && capacity > 0
    ? Math.min(100, used / capacity * 100) : null;
  const measured = Number.isSafeInteger(timing?.outputRequestCount) && timing.outputRequestCount > 0
    && validCount(timing?.totalOutputTokens) && validCount(timing?.totalOutputTimeMs) && timing.totalOutputTimeMs > 0;
  const speed = measured ? timing.totalOutputTokens / timing.totalOutputTimeMs * 1000 : null;
  return { speed: validCount(speed) ? speed : null, cacheHit, contextPercent };
}
