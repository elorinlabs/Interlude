import { displayText } from '../i18n/index';
import { useLanguage } from '../i18n';
import type { messageReferences } from '../../../../shared/chat/messageReferences';
import './messageReferences.css';

export function ChatMessageReferences({ references }: { references: ReturnType<typeof messageReferences> }) {
  useLanguage();
  if (!references.length) return null;
  return <div className="chat-message-references">
    {references.map(reference => <span className="chat-message-reference" key={reference.path}>
      {displayText(reference.label)}：{reference.name}
    </span>)}
  </div>;
}
