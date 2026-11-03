import type { LoungeSnapshot } from './types';

/** Entry badges exclude muted conversations; list rows always use unreadByConversation directly. */
export function notificationUnread(state: Pick<LoungeSnapshot, 'unreadByConversation' | 'mutedConversations'>) {
  const muted = new Set(state.mutedConversations);
  return Object.entries(state.unreadByConversation).reduce((sum, [id, count]) =>
    sum + (muted.has(id) ? 0 : count), 0);
}

export function notificationSettingsUpdate(state: LoungeSnapshot, frame: Record<string, unknown>) {
  if (frame.type === 'ready') {
    const muted = frame.mutedConversations;
    return { notificationSettingsAvailable: frame.notificationSettings === true,
      mutedConversations: Array.isArray(muted) && muted.every(id => typeof id === 'string') ? muted : [] };
  }
  if (frame.type !== 'notification-settings' || typeof frame.conversation !== 'string'
    || typeof frame.muted !== 'boolean') return;
  const muted = new Set(state.mutedConversations);
  if (frame.muted) muted.add(frame.conversation); else muted.delete(frame.conversation);
  return { mutedConversations: [...muted] };
}

export function notificationActionLabel(muted: boolean) {
  return muted ? 'client.lounge.unmuteNotifications' : 'client.lounge.muteNotifications';
}
