import type { GuiAccountsClient } from '../../../../shared/remote-chat/guiAccounts';
import { guiAccountAvatar } from '../../../../shared/remote-chat/guiAccountAvatar';
import { useGuiAccounts } from '../../../../shared/remote-chat/client/useGuiAccounts';
import { t, useLanguage } from '../i18n';
import './chat-list-button.css';

interface Props {
  client: GuiAccountsClient; active: boolean; ready: boolean; expanded: boolean; onClick: () => void;
}

export function ChatListButton({ client, active, ready, expanded, onClick }: Props) {
  useLanguage();
  const { snapshot } = useGuiAccounts(client, active && ready);
  const avatar = guiAccountAvatar(snapshot, t("client.chat.me"));
  return <button type="button" className="chat-list-button"
    aria-label={expanded ? t("client.chat.collapseChatList") : t("client.chat.openChatList")} aria-expanded={expanded} onClick={onClick}>
    <span className="chat-list-avatar" aria-hidden="true">{avatar.initials}</span>
  </button>;
}
