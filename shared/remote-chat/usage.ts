import { defaultText, type MessageTranslator } from '../localization/messages';
export interface UsageSummary {
  totalTokens: number;
  estimatedCostUsd: number;
  primaryRemainingPercent: number | null;
  primaryRemainingAggregated: boolean;
  providerEstimatedCost: { amountUsd: number; aggregated: boolean } | null;
  estimatedQuota?: { remainingUsd: number; capacityUsd: number | null };
}

export type ReadUsage = () => Promise<unknown>;
export const USAGE_REFRESH_INTERVAL_MS = 5_000;
const MILLION = 1_000_000;
const THOUSAND = 1_000;
const LOW_QUOTA_PERCENT = 20;
const WARNING_QUOTA_PERCENT = 50;
const THREAD_TOKEN_FRACTION_DIGITS = 2;

export function formatConversationTokens(value?: number) {
  if (value === undefined || !Number.isFinite(value) || value < 0) return '—';
  if (value >= MILLION) return `${(value / MILLION).toFixed(THREAD_TOKEN_FRACTION_DIGITS)}M`;
  if (value >= THOUSAND) return `${(value / THOUSAND).toFixed(THREAD_TOKEN_FRACTION_DIGITS)}k`;
  return value.toLocaleString();
}

export function formatThreadTokens(value?: number) {
  if (value === undefined || !Number.isFinite(value) || value < 0) return '—';
  const divisor = value >= MILLION ? MILLION : THOUSAND;
  const unit = value >= MILLION ? 'M' : 'K';
  return `${(value / divisor).toFixed(THREAD_TOKEN_FRACTION_DIGITS)}${unit}`;
}

export function formatTokens(value: number, fractionDigits?: number) {
  const options = {
    minimumFractionDigits: fractionDigits ?? 0,
    maximumFractionDigits: fractionDigits ?? (value >= MILLION ? 2 : 1),
  };
  if (value >= MILLION) return `${(value / MILLION).toLocaleString('en-US', options)}M`;
  if (value >= THOUSAND) return `${(value / THOUSAND).toLocaleString('en-US', options)}K`;
  return value.toLocaleString('en-US');
}

export function formatCost(value: number) {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2 })}USD`;
}

export function usageTrailing(usage: UsageSummary | null, translate: MessageTranslator = defaultText, cost = formatCost,
  options: { compactQuota?: boolean } = {}) {
  const remaining = usage?.primaryRemainingPercent;
  if (typeof remaining === 'number' && Number.isFinite(remaining)) {
    const label = usage?.primaryRemainingAggregated ? "client.shared.combinedAccountQuotaRemaining" : "client.shared.currentAccountQuotaRemaining";
    return {
      text: `${Math.round(remaining)}%`,
      label: translate(usage?.primaryRemainingAggregated ? "client.shared.totalRemaining" : "client.accounts.remaining"),
      description: `${translate(label)}：${remaining.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`,
      tone: remaining <= LOW_QUOTA_PERCENT ? 'low' : remaining <= WARNING_QUOTA_PERCENT ? 'cost' : 'quota',
      quota: {
        remaining: translate(options.compactQuota
          ? 'client.chatQuota.remainingCompact' : 'client.chatQuota.estimatedRemaining', {
          amount: usage?.estimatedQuota ? cost(usage.estimatedQuota.remainingUsd) : '—',
        }),
        total: translate('client.chatQuota.estimatedTotal', {
          amount: usage?.estimatedQuota?.capacityUsd == null ? '—' : cost(usage.estimatedQuota.capacityUsd),
        }),
        description: translate('client.chatQuota.estimateDescription'),
      },
    } as const;
  }
  const estimate = usage?.providerEstimatedCost;
  if (!estimate) return null;
  const label = estimate.aggregated ? "client.shared.estimatedCombinedApiCostToday" : "client.shared.estimatedApiCostToday";
  return { text: `API ${cost(estimate.amountUsd)}`, label: '',
    description: `${translate(label)}：${cost(estimate.amountUsd)}`, tone: 'cost', quota: null } as const;
}
