import { t, useLanguage } from '../i18n';
import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { useChatSearch } from '../../../../shared/chat/useChatSearch';
import { ChatSearchResults } from './ChatSearchResults';
import type { ChatController, ChatState, Thread } from './types';

export function ChatSearch({ state, controller, onClose, select }: {
  state: ChatState; controller: ChatController; onClose: () => void; select: (thread: Thread) => void;
}) {
  useLanguage();
  const [query, setQuery] = useState('');
  const search = useChatSearch({ controller, query, archived: state.archived, ready: state.ready });
  return <AdaptiveSheet open title={state.archived ? t("client.chat.searchArchivedChats") : t("client.chat.searchChats")} width={680} onClose={onClose}>
    <div className="chat-detail-stack">
      <form className="chat-search chat-row" onSubmit={event => { event.preventDefault(); search.reload(); }}>
        <Search size={18} /><input aria-label={t("client.chat.searchChats")} placeholder={t("client.chat.searchChats")} autoFocus value={query}
          onChange={event => setQuery(event.target.value)} />
        {query && <button type="button" className="chat-back" aria-label={t("client.projectBrowser.clearSearch")} onClick={() => setQuery('')}>
          <X size={16} /></button>}<button type="submit" className="chat-back" aria-label={t("client.chat.search")}
          disabled={!state.ready || search.loading}><Search size={18} /></button>
      </form>
      <div className="chat-search-results chat-scroll">
        <ChatSearchResults state={state} search={search} query={query} select={select} />
      </div>
    </div>
  </AdaptiveSheet>;
}
