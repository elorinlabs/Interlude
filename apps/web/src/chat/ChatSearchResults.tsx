import { displayText } from '../i18n/index';
import { displayError } from '../i18n/index';
import { MessageSquare } from 'lucide-react';
import { t, useLanguage } from '../i18n';
import type { useChatSearch } from '../../../../shared/chat/useChatSearch';
import { threadPresentation } from '../../../../shared/remote-chat/sidebar';
import type { ChatState, Thread } from './types';

export function ChatSearchResults({ state, search, query, select }: {
  state: ChatState; search: ReturnType<typeof useChatSearch>; query: string; select: (thread: Thread) => void;
}) {
  useLanguage();
  const emptyMessage = !state.ready ? t("client.chat.connectToYourComputerToSearchChats")
    : query.trim() ? t("client.chat.noMatchingChats") : t("client.chat.enterKeywordsToFindAChat");
  return <>
    {search.threads.map(thread => {
      const view = threadPresentation(thread, state.sidebar, displayText);
      return <button key={thread.id} type="button" className="chat-thread" aria-label={view.title}
        aria-current={state.selected?.id === thread.id ? 'page' : undefined}
        disabled={!state.ready || state.sending} onClick={() => select(thread)}><MessageSquare size={20} />
        <span className="chat-grow"><span className="chat-ellipsis">{view.title}</span>
          <small className="chat-muted">{view.projectName}</small></span></button>;
    })}
    {!search.loading && !search.error && !search.threads.length && <p className="chat-empty chat-muted">
      {emptyMessage}</p>}
    {search.loading && <p role="status" className="chat-muted">{t("client.projectBrowser.searching")}</p>}
    {search.error && <><p role="alert" className="chat-error">{displayError(search.error)}</p>
      <button type="button" className="chat-button" onClick={search.reload}>{t("client.terminal.retry")}</button></>}
    {search.cursor && !search.loading && !search.error && <button type="button" className="chat-button"
      disabled={!state.ready} onClick={search.loadMore}>{t("client.chat.loadMore")}</button>}
  </>;
}
