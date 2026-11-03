export interface QuotedMessage { text: string; quotes: string[] }
const QUOTE_HEADER = /^(?:引用 AI 回答：|引用对话内容：|引用文件内容：)\n/;

/** Decode the existing PC wire format, including historical messages, without changing stored text. */
export function quotedMessage(source: string): QuotedMessage {
  const normalized = source.replace(/\r\n?/g, '\n');
  const header = normalized.match(QUOTE_HEADER);
  const plain = { text: source, quotes: [] };
  if (!header) return plain;
  const lines = normalized.slice(header[0].length).split('\n');
  const quotes: string[] = [];
  let cursor = 0;
  while (lines[cursor]?.startsWith('> ')) {
    const quote: string[] = [];
    while (lines[cursor]?.startsWith('> ')) quote.push(lines[cursor++].slice(2));
    if (!quote.join('\n').trim()) return plain;
    quotes.push(quote.join('\n'));
    if (cursor === lines.length) return { text: '', quotes };
    // Only the serializer's empty separator can end a reference; malformed input remains ordinary text.
    if (lines[cursor] !== '') return plain;
    cursor++;
  }
  return quotes.length ? { text: lines.slice(cursor).join('\n'), quotes } : plain;
}
