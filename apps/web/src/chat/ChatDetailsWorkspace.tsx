import { displayText } from '../i18n/index';
import { useContext, useMemo, type ReactNode } from 'react';
import { DetailsWorkspace } from '../../../desktop/src/pages/codexGui/DetailsWorkspace';
import { DiffTextContext, type DiffTranslate } from '../../../../shared/chat/diffText';
import { useLanguage } from '../i18n';
import { ChatFileContext } from './ChatFileLink';
import { ChatRemoteFilePreview } from './ChatRemoteFilePreview';
import './detailsWorkspace.css';

/** Keep one layout tree across viewport changes so composer drafts and terminal sessions survive. */
export function ChatDetailsWorkspace({ selected, active, enabled, children }: {
  selected: string | null; active: boolean; enabled: boolean; children: ReactNode;
}) {
  const language = useLanguage();
  const files = useContext(ChatFileContext);
  // Refresh memoized diff content when the language changes without resetting the review state.
  const translate = useMemo<DiffTranslate>(() => (source, values) => displayText(source, values), [language]);
  return <DiffTextContext.Provider value={translate}>
    <DetailsWorkspace selected={selected} active={active} enabled={enabled}
      renderRemoteFile={files ? props => <ChatRemoteFilePreview {...props} context={files}
        key={`${props.target.threadId}:${props.target.path}:${props.target.line ?? ''}`} /> : undefined}
      className="chat-diff-workspace" contentClassName="chat-diff-layout">{children}</DetailsWorkspace>
  </DiffTextContext.Provider>;
}
