import type { Turn } from '../remote-chat/client/types';

/** Turns are chronological; an older running status can survive a missed completion event. */
export function currentRunningTurn(turns: readonly Turn[] | undefined): Turn | undefined {
  const latest = turns?.at(-1);
  return latest?.status === 'inProgress' ? latest : undefined;
}
