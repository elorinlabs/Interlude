import type { Item } from '../remote-chat/client/types';

/** Keep snapshot order while anchoring unsaved live messages to their known neighbours. */
export function mergeItemOrder(snapshot: Item[], live: Item[]): string[] {
  const known = new Set(snapshot.map(item => item.id));
  const before = new Map<string, string[]>();
  let pending: string[] = [];
  let previous: string | undefined;
  for (const item of live) {
    if (!known.has(item.id)) {
      pending.push(item.id);
      continue;
    }
    if (pending.length) before.set(item.id, pending);
    pending = [];
    previous = item.id;
  }
  const ordered = snapshot.flatMap(item => [
    ...(before.get(item.id) ?? []), item.id, ...(item.id === previous ? pending : []),
  ]);
  return previous === undefined ? [...ordered, ...pending] : ordered;
}
