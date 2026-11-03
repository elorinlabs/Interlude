import type { Item } from '../remote-chat/client/types';

/** Empty streamed summaries should not create blank rows or inflate the activity count. */
export function hasVisibleProcessContent(item: Item) {
  if (item.type === 'agentMessage') return Boolean(item.text?.trim());
  if (item.type !== 'reasoning') return true;
  return [...(item.summary ?? []), ...(item.content ?? [])]
    .some((part) => typeof part === 'string' && Boolean(part.trim()));
}
