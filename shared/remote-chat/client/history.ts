import type { Item, Thread, Turn } from './types';
import { restoreTurnTiming } from '../../../apps/desktop/src/pages/codexGui/turnTiming';
import { reconcileAcknowledgedItems } from '../../chat/acknowledgedMessages';
import { mergeItemOrder } from '../../chat/itemOrder';

function mergeItem(snapshot: Item, live: Item, before?: Item): Item {
  const merged = { ...snapshot, ...live };
  for (const field of ['text', 'aggregatedOutput'] as const) {
    const readValue = snapshot[field];
    const liveValue = live[field];
    const includesUnloadedTail = !before && liveValue && readValue?.includes(liveValue);
    if (readValue && (!liveValue || readValue.startsWith(liveValue) || includesUnloadedTail)) merged[field] = readValue;
  }
  return merged;
}

function mergeTurn(snapshot: Turn, live: Turn, before?: Turn, authoritative = false): Turn {
  const original = new Map(before?.items.map((item) => [item.id, item]));
  const hasAcknowledgements = snapshot.items.some((item) => item.localEcho) || live.items.some((item) => item.localEcho);
  const snapshotItems = reconcileAcknowledgedItems(snapshot.items, live.items);
  const liveItems = reconcileAcknowledgedItems(live.items, snapshot.items);
  const items = new Map(snapshotItems.map((item) => [item.id, item]));
  for (const item of liveItems) {
    if (item === original.get(item.id)
      && (authoritative || (live.status !== 'inProgress' && !hasAcknowledgements))) continue;
    const existing = items.get(item.id);
    items.set(item.id, existing ? mergeItem(existing, item, original.get(item.id)) : item);
  }
  const terminal = live.status !== 'inProgress' ? live.status : snapshot.status;
  const order = mergeItemOrder(snapshotItems, liveItems.filter(item => items.has(item.id)));
  // Live events can carry an estimated start; the PC snapshot corrects it once timing is available.
  return { ...snapshot, ...live, startedAt: snapshot.startedAt ?? live.startedAt,
    status: terminal, items: order.map(id => items.get(id)!) };
}

/** A settled PC snapshot retires missing running turns, except events received during the read. */
export function discardStaleRunningTurns(snapshot: Thread, live: Thread, before: Thread): Thread {
  if (!snapshot.turns || !['idle', 'notLoaded'].includes(snapshot.status?.type ?? '')
    || snapshot.turns.some(turn => turn.status === 'inProgress')) return live;
  const retained = new Set(snapshot.turns.map(turn => turn.id));
  const original = new Map(before.turns?.map(turn => [turn.id, turn]));
  const turns = live.turns?.filter(turn => turn.status !== 'inProgress'
    || retained.has(turn.id) || turn !== original.get(turn.id));
  return { ...live, turns };
}

/** Preserve notifications received while a history snapshot was in flight. */
export function mergeHistory(snapshot: Thread, live: Thread, before: Thread, authoritative = false): Thread {
  if (snapshot.id !== live.id) return snapshot;
  live = discardStaleRunningTurns(snapshot, live, before);
  const original = new Map(before.turns?.map((turn) => [turn.id, turn]));
  const turns = new Map(snapshot.turns?.map((turn) => [turn.id, turn]));
  for (const turn of live.turns ?? []) {
    const existing = turns.get(turn.id);
    if (turn === original.get(turn.id) && (authoritative || (turn.status !== 'inProgress'
      && !turn.items.some((item) => item.localEcho) && !existing?.items.some((item) => item.localEcho)))) continue;
    turns.set(turn.id, existing ? mergeTurn(existing, turn, original.get(turn.id), authoritative) : turn);
  }
  const previous = new Map(live.turns?.map((turn) => [turn.id, turn]));
  // Notifications received during a history read take precedence, including decreases after compaction.
  const tokenUsage = live.tokenUsage !== before.tokenUsage
    ? live.tokenUsage : snapshot.tokenUsage ?? live.tokenUsage;
  return { ...snapshot, ...(tokenUsage ? { tokenUsage } : {}),
    turns: [...turns.values()].map((turn) => turn.status === 'inProgress'
    ? restoreTurnTiming(turn, previous.get(turn.id)) : turn) };
}
