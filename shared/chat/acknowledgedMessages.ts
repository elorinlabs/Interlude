import type { GuiEvent, Item, Thread, Turn } from '../remote-chat/client/types';

export const MESSAGE_ACKNOWLEDGED = 'chat/message/acknowledged';

/** The ordinal identifies repeated identical sends without matching their text or attachment URLs. */
export function acknowledgeMessage(turn: Turn, event: GuiEvent): Turn {
  const { item, userMessageIndex, afterItemId, beforeItemId } = event.params;
  if (!item || !item.localEcho || !Number.isSafeInteger(userMessageIndex) || userMessageIndex! < 0) return turn;
  const users = turn.items.filter((entry) => entry.type === 'userMessage');
  if (users.length > userMessageIndex! || turn.items.some((entry) => entry.id === item.id)) return turn;
  const before = turn.items.findIndex(entry => entry.id === beforeItemId);
  const after = turn.items.findIndex(entry => entry.id === afterItemId);
  let position = userMessageIndex === 0 ? 0 : turn.items.length;
  if (before >= 0) position = before;
  else if (after >= 0) position = after + 1;
  return { ...turn, items: [...turn.items.slice(0, position), item, ...turn.items.slice(position)] };
}

export function reconcileAcknowledgedItems(live: Item[], snapshot: Item[]): Item[] {
  const users = snapshot.filter((item) => item.type === 'userMessage' && !item.localEcho);
  const liveUsers = live.filter((item) => item.type === 'userMessage');
  const anchor = liveUsers.findIndex((item) => !item.localEcho && users.some((user) => user.id === item.id));
  // Loading older pages shifts user ordinals. Align by a real message before comparing echoes.
  const offset = anchor < 0 ? 0 : users.findIndex((item) => item.id === liveUsers[anchor].id) - anchor;
  let ordinal = 0;
  return live.flatMap((item) => {
    if (item.type !== 'userMessage') return [item];
    const server = users[offset + ordinal++];
    return item.localEcho && server ? [] : [item];
  });
}

const acknowledgedTurns = new WeakMap<Turn, { threadId: string; events: GuiEvent[] }>();

export function acknowledgedEvents(thread: Thread): GuiEvent[] {
  return (thread.turns ?? []).flatMap((turn) => {
    const cached = acknowledgedTurns.get(turn);
    if (cached?.threadId === thread.id) return cached.events;
    let userMessageIndex = 0;
    const events = turn.items.flatMap((item, position): GuiEvent[] => {
      if (item.type !== 'userMessage') return [];
      const index = userMessageIndex++;
      return item.localEcho ? [{ method: MESSAGE_ACKNOWLEDGED,
        params: { threadId: thread.id, turnId: turn.id, item, userMessageIndex: index,
          turn: { id: turn.id, status: turn.status, items: [], startedAt: turn.startedAt,
            completedAt: turn.completedAt, durationMs: turn.durationMs },
          afterItemId: turn.items[position - 1]?.id, beforeItemId: turn.items[position + 1]?.id } }] : [];
    });
    acknowledgedTurns.set(turn, { threadId: thread.id, events });
    return events;
  });
}
