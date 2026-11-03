import type { MessageKey } from '@interlude/i18n';
import type { DailyTokenUsage } from '../../apps/desktop/src/types';
import type { DailyTokenUsageBreakdown } from '../../apps/desktop/src/types/tokenUsageAnalytics';

export type ConsumptionField = readonly [MessageKey, Exclude<keyof DailyTokenUsageBreakdown, 'date'>];

export const TOKEN_FIELDS = [
  ['client.chat.total.e8dc87', 'totalTokens'],
  ['client.chat.input', 'inputTokens'],
  ['client.chat.output', 'outputTokens'],
  ['client.chat.reasoning', 'reasoningTokens'],
  ['client.chat.cached', 'cachedTokens'],
] as const satisfies ReadonlyArray<readonly [MessageKey, keyof DailyTokenUsage]>;

export const CONTEXT_FIELDS = [
  ['client.chat.shortContext', 'shortContextTokens'],
  ['client.chat.longContext', 'longContextTokens'],
  ['client.chat.unknown', 'unknownContextTokens'],
] as const satisfies readonly ConsumptionField[];

export const MODE_FIELDS = [
  ['client.chat.standardMode', 'standardModeTokens'],
  ['client.chat.fastMode.6e02d1', 'fastModeTokens'],
  ['client.chat.unknown', 'unknownModeTokens'],
] as const satisfies readonly ConsumptionField[];
