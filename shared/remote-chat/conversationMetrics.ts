import type { CommandMetrics } from './commandMetrics';
import { formatCost } from './usage';

export const CONVERSATION_METRICS_OPERATION = 'conversationMetrics';
export const CONVERSATION_METRICS_REFRESH_MS = 2_000;

export interface ConversationMetrics extends Partial<CommandMetrics> {
  estimatedCostUsd?: number | null;
  /** Older remote hosts may not report first-token timing yet. */
  totalFirstTokenTimeMs?: number;
  firstTokenRequestCount?: number;
  totalOutputTokens: number;
  totalOutputTimeMs: number;
  outputRequestCount: number;
}

export type ReadConversationMetrics = (threadId: string) => Promise<ConversationMetrics>;

export function formatConversationCost(metrics?: ConversationMetrics | null): string {
  const cost = metrics?.estimatedCostUsd;
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? formatCost(cost) : '—USD';
}

/** Match the account-page average: output tokens divided by time after the first response. */
export function formatConversationTps(metrics?: ConversationMetrics | null): string {
  if (!metrics || !(metrics.outputRequestCount > 0) || !(metrics.totalOutputTimeMs > 0)
    || !Number.isFinite(metrics.totalOutputTimeMs) || !Number.isFinite(metrics.totalOutputTokens)
    || metrics.totalOutputTokens < 0) return '—';
  const tps = metrics.totalOutputTokens / metrics.totalOutputTimeMs * 1_000;
  return Number.isFinite(tps) ? tps.toFixed(1) : '—';
}

export const CONVERSATION_TPS_DESCRIPTION =
  "client.mobile.averageOutputSpeedForThisConversationOutputTokensDividedBy";

/** Average wait for the first observed output token, in seconds without a unit suffix. */
export function formatConversationTtft(metrics?: ConversationMetrics | null): string {
  const total = metrics?.totalFirstTokenTimeMs;
  const count = metrics?.firstTokenRequestCount;
  if (typeof total !== 'number' || !Number.isFinite(total) || total < 0
    || typeof count !== 'number' || !Number.isSafeInteger(count) || count <= 0) return '—';
  return (total / count / 1_000).toFixed(2);
}

export const CONVERSATION_TTFT_DESCRIPTION =
  "client.mobile.averageTimeFromSendingARequestToReceivingTheFirst";
