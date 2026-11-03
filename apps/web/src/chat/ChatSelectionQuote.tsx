import { t, useLanguage } from '../i18n';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquareQuote } from 'lucide-react';
import { useQuoteSelection } from '../../../desktop/src/pages/codexGui/useQuoteSelection';
import { selectedQuote } from '../../../desktop/src/pages/codexGui/selectedQuote';
import { useChatQuotes } from './ChatQuotes';

export function ChatSelectionQuote({ root, selected, enabled }: {
  root: RefObject<HTMLDivElement>; selected: string | null; enabled: boolean;
}) {
  useLanguage();
  const quotes = useChatQuotes();
  const { selection, dismiss } = useQuoteSelection({ root, selected, enabled: enabled && Boolean(quotes) });
  if (!selection) return null;
  return createPortal(<button type="button" className="chat-selection-quote"
    style={{ left: selection.left, top: selection.top }} aria-label={t("client.chat.quoteSelectedTextAndReply")}
    onMouseDown={event => event.preventDefault()} onClick={() => {
      const current = root.current ? selectedQuote(root.current) : null;
      if (!current || !quotes) return;
      quotes.add({ ...current.quote, role: 'assistant' });
      dismiss();
    }}><MessageSquareQuote size={15} />{t("client.chat.quoteReply")}</button>, document.body);
}
