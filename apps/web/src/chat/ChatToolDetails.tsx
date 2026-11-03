import { displayText } from '../i18n/index';
import { t, useLanguage } from '../i18n';
import type { Item } from './types';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { messageLabel } from '../../../../shared/chat/messageDetails';
import { toolText } from '../../../../shared/chat/toolText';
import { ChatQuoteButton } from './ChatQuotes';
import { ChatToolContent } from './ChatToolContent';
export function ChatToolDetails({ item, onClose, onBack, tabId }: {
  item: Item; onClose: () => void; onBack?: () => void; tabId?: string;
}) {
  useLanguage();
  return <AdaptiveSheet open tabId={tabId} title={displayText(messageLabel(item))} width={760} onClose={onClose} onBack={onBack}
    presentation={item.type === 'fileChange' ? 'drawer' : 'adaptive'}>
    <div className="chat-detail-stack">
      {item.status === 'inProgress' && <p className="chat-muted">{t("client.chat.inProgress.dbb151")}</p>}
      <ChatToolContent item={item} />
      <ChatQuoteButton messageId={item.id} role="tool" text={toolText(item)} onQuote={onClose} />
    </div>
  </AdaptiveSheet>;
}
