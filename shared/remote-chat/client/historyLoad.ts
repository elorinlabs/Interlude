import type { Thread } from './types';

export interface HistoryLoadResult {
  threadId: string;
  count: number;
  durationMs: number;
  completedAt: number;
}

/** Count the newly prepended records, excluding replies arriving at the end during the read. */
export function historyLoadResult(before: Thread, loaded: Thread, startedAt: number): HistoryLoadResult {
  const existing = new Map(before.turns?.map(turn => [turn.id, new Set(turn.items.map(item => item.id))]));
  let count = 0;
  older: for (const turn of loaded.turns ?? []) {
    for (const item of turn.items) {
      if (existing.get(turn.id)?.has(item.id)) break older;
      count++;
    }
  }
  const completedAt = Date.now();
  return { threadId: loaded.id, count, durationMs: Math.max(0, completedAt - startedAt), completedAt };
}
