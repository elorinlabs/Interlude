export interface CommandMetrics {
  successfulCommandCount: number;
  completedCommandCount: number;
}

export interface CommandMetricItem {
  id: string;
  type: string;
  status?: string;
  exitCode?: number | null;
}

export interface CommandMetricTurn { id: string; items: readonly CommandMetricItem[] }

const turnMetrics = new WeakMap<readonly CommandMetricItem[], CommandMetrics>();

/** A terminal failure is known even when the process did not produce an exit code. */
export function commandOutcome(item: CommandMetricItem): boolean | undefined {
  if (item.type !== 'commandExecution') return undefined;
  if (item.status === 'failed') return false;
  if (item.status !== 'completed' || !Number.isSafeInteger(item.exitCode)) return undefined;
  return item.exitCode === 0;
}

export function summarizeCommands(turns: readonly CommandMetricTurn[]): CommandMetrics {
  const counts = new Map(turns.map(turn => [turn.id, summarizeTurnCommands(turn.items)]));
  let successfulCommandCount = 0;
  let completedCommandCount = 0;
  for (const count of counts.values()) {
    successfulCommandCount += count.successfulCommandCount;
    completedCommandCount += count.completedCommandCount;
  }
  return { successfulCommandCount, completedCommandCount };
}

function summarizeTurnCommands(items: readonly CommandMetricItem[]): CommandMetrics {
  const cached = turnMetrics.get(items);
  if (cached) return cached;
  const outcomes = new Map<string, boolean>();
  for (const item of items) {
    const outcome = commandOutcome(item);
    if (outcome === undefined) outcomes.delete(item.id);
    else outcomes.set(item.id, outcome);
  }
  const result = countCommandOutcomes(outcomes.values());
  // Immutable history arrays let streamed text reuse counts from completed turns.
  turnMetrics.set(items, result);
  return result;
}

export function countCommandOutcomes(outcomes: Iterable<boolean>): CommandMetrics {
  let successfulCommandCount = 0;
  let completedCommandCount = 0;
  for (const success of outcomes) {
    completedCommandCount += 1;
    if (success) successfulCommandCount += 1;
  }
  return { successfulCommandCount, completedCommandCount };
}

export function formatConversationTsr(metrics?: Partial<CommandMetrics> | null): string {
  const success = metrics?.successfulCommandCount;
  const total = metrics?.completedCommandCount;
  if (typeof success !== 'number' || !Number.isSafeInteger(success) || success < 0
    || typeof total !== 'number' || !Number.isSafeInteger(total) || total <= 0 || success > total) return '—';
  return `${(success / total * 100).toFixed(1)}%`;
}

export const CONVERSATION_TSR_DESCRIPTION = 'client.chat.commandSuccessRateDescription';
