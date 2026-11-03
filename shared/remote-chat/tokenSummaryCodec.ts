import type { AccountQuotaHistory, AccountQuotaPoint } from
  '../../apps/desktop/src/types/tokenUsageAnalytics';
import type { TokenSummary } from './tokenSummary';

export const QUOTA_HISTORY_FORMAT = 'runs-v1';

// Each run shares quota levels and reset times, but retains every observation's timestamp.
type QuotaRun = [
  startTs: number,
  primaryRemainingPercent: number | null,
  secondaryRemainingPercent: number | null,
  primaryResetAt: number | null,
  secondaryResetAt: number | null,
  timestampDeltas: number[],
];

interface CompactQuotaHistory extends Omit<AccountQuotaHistory, 'points'> {
  runs: QuotaRun[];
}

interface CompactTokenSummary extends Omit<TokenSummary, 'quotaHistory'> {
  quotaHistoryFormat: typeof QUOTA_HISTORY_FORMAT;
  quotaHistory: CompactQuotaHistory[];
}

export type TokenSummaryResponse = TokenSummary | CompactTokenSummary;

function sameQuota(left: AccountQuotaPoint, right: AccountQuotaPoint) {
  return left.primaryRemainingPercent === right.primaryRemainingPercent
    && left.secondaryRemainingPercent === right.secondaryRemainingPercent
    && left.primaryResetAt === right.primaryResetAt
    && left.secondaryResetAt === right.secondaryResetAt;
}

function encodeHistory({ points, ...account }: AccountQuotaHistory): CompactQuotaHistory {
  const runs: QuotaRun[] = [];
  let previous: AccountQuotaPoint | undefined;
  let deltas: number[] = [];
  for (const point of points) {
    if (previous && sameQuota(previous, point)) {
      deltas.push(point.ts - previous.ts);
    } else {
      deltas = [];
      runs.push([point.ts, point.primaryRemainingPercent, point.secondaryRemainingPercent,
        point.primaryResetAt, point.secondaryResetAt, deltas]);
    }
    previous = point;
  }
  return { ...account, runs };
}

function decodeHistory({ runs, ...account }: CompactQuotaHistory): AccountQuotaHistory {
  const points: AccountQuotaPoint[] = [];
  for (const [startTs, primaryRemainingPercent, secondaryRemainingPercent,
    primaryResetAt, secondaryResetAt, deltas] of runs) {
    const values = { primaryRemainingPercent, secondaryRemainingPercent, primaryResetAt, secondaryResetAt };
    let ts = startTs;
    points.push({ ts, ...values });
    for (const delta of deltas) {
      ts += delta;
      points.push({ ts, ...values });
    }
  }
  return { ...account, points };
}

/** Opt-in wire format; old clients continue receiving the original summary shape. */
export function encodeTokenSummary(summary: TokenSummary): CompactTokenSummary {
  return { ...summary, quotaHistoryFormat: QUOTA_HISTORY_FORMAT,
    quotaHistory: summary.quotaHistory.map(encodeHistory) };
}

/** Accept legacy desktops while restoring all observations before calculating charts. */
export function decodeTokenSummary(summary: TokenSummaryResponse): TokenSummary {
  if (!('quotaHistoryFormat' in summary)) return summary;
  const { quotaHistoryFormat, ...data } = summary;
  if (quotaHistoryFormat !== QUOTA_HISTORY_FORMAT) throw new Error('Unsupported quota history format');
  return { ...data, quotaHistory: summary.quotaHistory.map(decodeHistory) };
}
