import type { LoungeMessage } from './types';
import { historyTerms, historyText } from './archive';

/** Searches only messages received by this client; it never requests a server history. */
export function searchLoungeHistory(messages: readonly LoungeMessage[], query: string): LoungeMessage[] {
  const terms = historyTerms(query);
  return messages.filter(message => {
    const content = historyText(message);
    return terms.every(term => content.includes(term));
  }).reverse();
}
