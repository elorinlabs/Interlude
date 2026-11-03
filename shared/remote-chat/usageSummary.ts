import type { UsageSummary } from './usage';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function decodeProviderCost(value: unknown): UsageSummary['providerEstimatedCost'] {
  if (!isRecord(value) || !isNonNegativeNumber(value.amountUsd)) return null;
  return { amountUsd: value.amountUsd, aggregated: value.aggregated === true };
}

function decodeEstimatedQuota(value: unknown): UsageSummary['estimatedQuota'] {
  if (!isRecord(value) || !isNonNegativeNumber(value.remainingUsd)) return undefined;
  const capacityUsd = isNonNegativeNumber(value.capacityUsd) && value.capacityUsd >= value.remainingUsd
    ? value.capacityUsd : null;
  return { remainingUsd: value.remainingUsd, capacityUsd };
}

/** Validate transport data before rendering; unavailable totals must never look like zero usage. */
export function decodeUsageSummary(value: unknown): UsageSummary {
  if (!isRecord(value) || !isNonNegativeNumber(value.totalTokens) || !isNonNegativeNumber(value.estimatedCostUsd)) {
    throw new Error('Invalid usage summary');
  }
  // Older hosts may omit optional quota and API estimates. Keep valid totals usable in that case.
  const estimatedQuota = decodeEstimatedQuota(value.estimatedQuota);
  return {
    totalTokens: value.totalTokens,
    estimatedCostUsd: value.estimatedCostUsd,
    primaryRemainingPercent: isNonNegativeNumber(value.primaryRemainingPercent) ? value.primaryRemainingPercent : null,
    primaryRemainingAggregated: value.primaryRemainingAggregated === true,
    providerEstimatedCost: decodeProviderCost(value.providerEstimatedCost),
    ...(estimatedQuota ? { estimatedQuota } : {}),
  };
}
