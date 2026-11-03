import { t, useLanguage } from '../i18n';
import type { ChatController, ChatState } from './types';

export function ChatThreadFilter({ state, controller }: { state: ChatState; controller: ChatController }) {
  useLanguage();
  return <button className="chat-thread-filter" type="button" disabled={!state.ready || state.loading}
    onClick={() => { void controller.list({ archived: !state.archived }); }}>
    {state.archived ? t("client.chat.archived") : t("client.chat.recentChats")}
  </button>;
}
