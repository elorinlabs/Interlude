export interface ReplyQuote { messageId: string; text: string; source?: 'file' }
export const MAX_REPLY_QUOTES = 8;
export const MAX_QUOTE_CHARACTERS = 16_000;

export function quoteKey(quote: ReplyQuote): string {
  return JSON.stringify([quote.messageId, quote.text]);
}

/** Blockquote every line so selected content stays separate from the user's reply. */
export function quotedReply(text: string, quotes: ReplyQuote[] = []): string {
  if (!quotes.length) return text;
  const references = quotes.map((quote) => quote.text.replace(/\r\n?/g, "\n")
    .split("\n").map((line) => `> ${line}`).join("\n")).join("\n\n");
  const header = quotes.every(quote => quote.source === 'file') ? '引用文件内容：'
    : quotes.some(quote => quote.source === 'file') ? '引用对话内容：' : '引用 AI 回答：';
  return `${header}\n${references}${text.trim() ? `\n\n${text}` : ""}`;
}
