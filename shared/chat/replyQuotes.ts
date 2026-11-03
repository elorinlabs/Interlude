import { MAX_QUOTE_CHARACTERS, MAX_REPLY_QUOTES, quoteKey, quotedReply,
  type ReplyQuote } from '../../apps/desktop/src/pages/codexGui/replyQuotes';
import { getInterfaceLanguage } from "../localization/interfaceLanguage";
import { translateMessage } from "../localization/messages";

export { quoteKey };
export interface ChatQuote extends ReplyQuote { role: 'assistant' | 'user' | 'tool' }

export function appendQuote(quotes: ChatQuote[], quote: ChatQuote): { quotes: ChatQuote[]; error?: string } {
  const text = quote.text.trim();
  if (!text) return { quotes };
  if (text.length > MAX_QUOTE_CHARACTERS) return { quotes, error: '这段内容太长，请缩小引用范围。' };
  const entry = { ...quote, text };
  if (quotes.some((item) => quoteKey(item) === quoteKey(entry))) return { quotes };
  if (quotes.length >= MAX_REPLY_QUOTES) {
    return { quotes, error: translateMessage(getInterfaceLanguage(), "client.runtimeErrors.youCanAddUpToQuotesAtATime",
      { value1: MAX_REPLY_QUOTES }) };
  }
  return { quotes: [...quotes, entry] };
}

export function replyWithQuotes(text: string, quotes: ChatQuote[]): string {
  const result = quotedReply(text, quotes);
  return quotes.some((quote) => quote.role !== 'assistant')
    ? result.replace(/^引用 AI 回答：/, '引用对话内容：') : result;
}

export function clearSubmittedQuotes(current: ChatQuote[], submitted: ChatQuote[]): ChatQuote[] {
  const keys = new Set(submitted.map(quoteKey));
  return current.filter((quote) => !keys.has(quoteKey(quote)));
}
