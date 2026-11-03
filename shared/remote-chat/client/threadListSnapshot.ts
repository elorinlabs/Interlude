import type { Thread } from './types';

interface ListSnapshot {
  before: Thread[];
  current: Thread[];
  incoming: Thread[];
  more?: boolean;
}

/** Keep live row changes made while a page was loading; the trailing refresh reconciles their metadata. */
export function mergeThreadList({ before, current, incoming, more }: ListSnapshot) {
  const previous = new Map(before.map(thread => [thread.id, thread]));
  const changed = new Map(current.filter(thread => thread !== previous.get(thread.id))
    .map(thread => [thread.id, thread]));
  const summaries = incoming.map(thread => changed.get(thread.id) ?? thread);
  const pageIds = new Set(summaries.map(thread => thread.id));
  // New or newly active chats must stay visible even if the earlier snapshot omitted them.
  const base = more ? current : [...changed.values()].filter(thread => !pageIds.has(thread.id));
  const threads = [...new Map([...base, ...summaries].map(thread => [thread.id, thread])).values()];
  return { threads, summaries };
}
