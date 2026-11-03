import type { HistoryPage, HistoryQuery } from './archive';

export type DirectPermission = 'new' | 'waiting' | 'open';
export const AWAITING_REPLY = 'client.lounge.awaitingReply';

/** An opened conversation never closes again; concurrent status reads may arrive out of order. */
export function mergeDirectPermissions(permissions: Map<string, DirectPermission>, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  for (const [peer, value] of Object.entries(input)) {
    if (value === 'open' || value === 'waiting' && permissions.get(peer) !== 'open'
      || value === 'new' && !permissions.has(peer)) permissions.set(peer, value);
  }
}

/** Only local history is inspected. Read receipts and group messages never count as a reply. */
export async function checkDirectPermission(options: {
  self: string; peer: string; permission?: DirectPermission;
  page: (query: HistoryQuery) => Promise<HistoryPage>;
  generation?: number;
}) {
  if (options.permission === 'open') return;
  if (options.permission === 'waiting') throw new Error(AWAITING_REPLY);
  let before: HistoryQuery['before'];
  let sent = false;
  do {
    const page = await options.page({ query: '', conversation: options.peer, before });
    for (const message of page.messages) {
      if (options.generation !== undefined && (message.generation ?? 0) !== options.generation) continue;
      if (message.sender.id === options.peer && message.recipient?.id === options.self) return;
      if (message.sender.id === options.self && message.recipient?.id === options.peer) sent = true;
    }
    before = page.next;
  } while (before);
  if (sent) throw new Error(AWAITING_REPLY);
}
