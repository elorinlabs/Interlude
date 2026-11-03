import type { LoungeMessage, LoungeSnapshot } from './types';

export function removedConversation({ state, peer, generation, recent }: {
  state: LoungeSnapshot; peer: string; generation: number; recent: LoungeMessage[];
}) {
  const keep = (message: LoungeMessage) => message.conversation !== peer || (message.generation ?? 0) >= generation;
  const retained = recent.filter(keep);
  const newer = retained.filter(message => message.conversation === peer);
  const unreadByConversation = { ...state.unreadByConversation };
  delete unreadByConversation[peer];
  if (newer.length) unreadByConversation[peer] = newer.filter(message => message.delivery?.direction === 'incoming'
    && message.delivery.status !== 'read').length;
  return { recent: retained, snapshot: {
    contacts: state.contacts.filter(contact => contact.user.id !== peer || newer.length > 0), unreadByConversation,
    unread: Object.values(unreadByConversation).reduce((sum, count) => sum + count, 0),
    conversation: state.conversation === peer ? '' : state.conversation,
    messages: state.conversation === peer ? [] : state.messages, historyRevision: state.historyRevision + 1 } };
}

export function isCurrentDirect(message: LoungeMessage, generation: (peer: string) => number) {
  return !message.conversation || (message.generation ?? 0) >= generation(message.conversation);
}
