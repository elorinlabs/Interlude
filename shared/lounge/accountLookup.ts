import { parseAccount } from './contacts';
import type { LoungeAccount, LoungeMessage } from './types';

const LOOKUP_TIMEOUT_MS = 10_000;
const RECENT_SPEAKER_LIMIT = 20;
const LOOKUP_ERRORS = new Set(['client.lounge.accountLookupInvalid', 'client.lounge.accountLookupNotFound',
  'client.lounge.accountLookupAmbiguous', 'client.lounge.accountLookupSelf', 'client.lounge.accountLookupFailed']);
type PendingLookup = { finish: (user?: LoungeAccount, code?: string) => void };

/** Correlates private lookup replies without adding search results to contacts or history. */
export class LoungeAccountLookup {
  private pending = new Map<string, PendingLookup>();

  find(options: { socket: WebSocket; id: string; query: string; signal: AbortSignal }): Promise<LoungeAccount> {
    const { socket, id, query, signal } = options;
    if (signal.aborted) return Promise.reject(new Error('client.lounge.accountLookupFailed'));
    return new Promise((resolve, reject) => {
      const finish = (user?: LoungeAccount, code = 'client.lounge.accountLookupFailed') => {
        clearTimeout(timer); signal.removeEventListener('abort', abort); this.pending.delete(id);
        if (user) resolve(user); else reject(new Error(code));
      };
      const abort = () => finish();
      const timer = setTimeout(abort, LOOKUP_TIMEOUT_MS);
      this.pending.set(id, { finish }); signal.addEventListener('abort', abort, { once: true });
      try { socket.send(JSON.stringify({ type: 'lookup-account', id, query: query.trim() })); }
      catch { finish(); }
    });
  }

  receive(frame: Record<string, unknown>) {
    if (frame.type !== 'account-found' && frame.type !== 'rejected') return false;
    const pending = this.pending.get(String(frame.id));
    if (!pending) return false;
    const code = typeof frame.code === 'string' && LOOKUP_ERRORS.has(frame.code) ? frame.code : undefined;
    pending.finish(frame.type === 'account-found' ? parseAccount(frame.user) : undefined, code);
    return true;
  }

  disconnect() { for (const pending of this.pending.values()) pending.finish(); }
}

export function recentSpeakers(messages: readonly LoungeMessage[], self?: string, after = -Infinity): LoungeAccount[] {
  const users = new Map<string, LoungeAccount>();
  for (let index = messages.length - 1; index >= 0 && users.size < RECENT_SPEAKER_LIMIT; index--) {
    if (Date.parse(messages[index].sentAt) <= after) continue;
    const user = messages[index].sender;
    if (user.id !== self && !users.has(user.id)) users.set(user.id, user);
  }
  return [...users.values()];
}
