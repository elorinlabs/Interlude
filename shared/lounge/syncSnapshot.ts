import { historyKey, recentMessages } from './archive';
import { mergeDelivery } from './delivery';
import type { LoungeMessage, LoungeSnapshot } from './types';

/** Historical imports never create unread alerts; a read receipt on another device can clear an existing badge. */
export function synchronizedSnapshot(state: LoungeSnapshot, incoming: LoungeMessage[], recent: LoungeMessage[]) {
  const unreadByConversation = { ...state.unreadByConversation };
  const previous = new Map([...recent, ...state.messages].map(message => [historyKey(message), message]));
  const messages = incoming.map(message => {
    const old = previous.get(historyKey(message));
    const updated = old ? { ...old, delivery: mergeDelivery(old.delivery, message.delivery) } : message;
    if (old?.delivery?.direction === 'incoming' && old.delivery.status !== 'read' && updated.delivery?.status === 'read') {
      const conversation = message.conversation ?? '';
      unreadByConversation[conversation] = Math.max(0, (unreadByConversation[conversation] ?? 0) - 1);
    }
    return updated;
  });
  return { recent: recentMessages([...recent, ...messages]), change: {
    messages: recentMessages([...state.messages, ...messages.filter(message =>
      (message.conversation ?? '') === state.conversation)]),
    unreadByConversation, unread: Object.values(unreadByConversation).reduce((sum, count) => sum + count, 0),
    historyRevision: state.historyRevision + 1,
  } };
}
