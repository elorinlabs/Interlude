import type { MessageKey } from '@interlude/i18n';
import type { LoungeController } from './controller';
import type { ConversationRow } from './conversationRows';
import type { MobileLounge } from './useMobileLounge';
import { notificationActionLabel } from './notificationSettings';

export interface ConversationAction {
  key: 'direct' | 'pin' | 'block' | 'delete' | 'notifications';
  label: MessageKey;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/** Keep mobile action availability and dismissal identical across native and Web. */
export function conversationActions({ row, model, controller, close }: {
  row: ConversationRow; model: MobileLounge; controller: LoungeController; close: () => void;
}): ConversationAction[] {
  const user = row.user;
  const dismissThen = (action: () => void) => () => { close(); action(); };
  const notifications: ConversationAction = {
    key: 'notifications', label: notificationActionLabel(row.notificationsMuted), active: row.notificationsMuted,
    disabled: !model.state.notificationSettingsAvailable || model.state.status !== 'connected' || model.notifications.busy,
    onPress: dismissThen(() => { void model.notifications.save(row.id, !row.notificationsMuted); }),
  };
  if (!user) return [notifications];
  const actions: ConversationAction[] = [
    { key: 'direct', label: 'client.lounge.directChat', onPress: dismissThen(() => model.select(user)) },
    { key: 'pin', label: row.contact?.pinned ? 'client.lounge.unpinChat' : 'client.lounge.pinChat',
      active: row.contact?.pinned,
      onPress: dismissThen(() => controller.setPinned(row.id, !row.contact?.pinned)) },
  ];
  actions.push(notifications);
  if (model.state.directAvailable) actions.push({ key: 'block',
    label: model.state.blocked.includes(row.id) ? 'client.lounge.unblockUser' : 'client.lounge.blockUser',
    active: model.state.blocked.includes(row.id), onPress: dismissThen(() => model.setBlocking(user)) });
  actions.push({ key: 'delete', label: 'client.lounge.deleteChat',
    disabled: !model.state.directResetAvailable || model.state.status !== 'connected',
    onPress: dismissThen(() => model.setDeleting(user)) });
  return actions;
}
