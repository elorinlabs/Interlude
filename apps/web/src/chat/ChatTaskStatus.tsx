import { displayText } from '../i18n/index';
import { taskIssue } from '../../../../shared/remote-chat/taskStatus';
import { t, useLanguage } from '../i18n';
import type { ChatState } from './types';

export function ChatTaskStatus({ state }: { state: ChatState }) {
  useLanguage();
  const status = taskIssue(state);
  if (!status && !state.notificationError) return null;
  return <div role="status" className="chat-task-status" style={{ fontSize: 12 }}>
    {status && <div style={{ maxWidth: 400, overflowWrap: 'anywhere' }}>
      <strong>{displayText(status.label)}</strong><div className="chat-muted">{displayText(status.detail)}</div>
    </div>}
    {state.notificationError && <div role="alert" style={{ maxWidth: 400 }}>
      {t("client.chatReliability.someAlertsCouldNotBeSavedCheckFreeSpaceOn")}</div>}
  </div>;
}
