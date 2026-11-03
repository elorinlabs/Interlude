import { mergeContact, parseAccount, type LoungeContact } from './contacts';
import type { LoungeAccount, LoungeSnapshot } from './types';

const PAGE_SIZE = 200;
const PAGE_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 10_000;

interface ContactSyncOptions {
  snapshot: () => LoungeSnapshot;
  update: (change: Partial<LoungeSnapshot>) => void;
  persist: (contact: LoungeContact) => void;
  watch: () => void;
  profile: (user: LoungeAccount) => LoungeAccount;
  send: (frame: Record<string, unknown>) => boolean;
  account?: string;
}

/** Owns contact merging and paged cloud restoration; chat content remains in the device archive. */
export class LoungeContactSync {
  private enabled = false;
  private sequence = 0;
  private pending?: { id: string; cursor: string };
  private dirty = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly options: ContactSyncOptions) {}

  remember(incoming: LoungeContact) {
    const state = this.options.snapshot();
    if (incoming.user.id === state.user?.id || incoming.user.account === this.options.account) return;
    const contact = { ...incoming, user: this.options.profile(incoming.user) };
    const previous = state.contacts.find(value => value.user.id === contact.user.id);
    if (sameContact(previous, contact)) return;
    const contacts = mergeContact(state.contacts, contact);
    this.options.update({ contacts }); this.options.watch();
    this.options.persist(contacts.find(value => value.user.id === contact.user.id)!);
  }

  privacy(input: unknown) {
    if (!Array.isArray(input)) return;
    const users = input.map(parseAccount).filter((user): user is LoungeAccount => !!user);
    this.options.update({ blocked: users.map(user => user.id) });
    for (const user of users) this.remember({ user, direct: false });
  }

  presence(input: unknown) {
    if (!Array.isArray(input)) return;
    const statuses = new Map<string, boolean | null>();
    for (const value of input) {
      if (typeof value?.id === 'string' && (value.online === null || typeof value.online === 'boolean')) {
        statuses.set(value.id, value.online);
      }
    }
    this.options.update({ contacts: this.options.snapshot().contacts.map(contact =>
      contact.direct && statuses.has(contact.user.id) ? { ...contact, online: statuses.get(contact.user.id) } : contact) });
  }

  ready(enabled: boolean) {
    this.disconnect(); this.enabled = enabled;
    this.options.update({ contactsSyncError: false });
    if (enabled) this.request('');
  }

  disconnect() {
    clearTimeout(this.timer);
    this.timer = undefined; this.pending = undefined; this.enabled = false; this.dirty = false;
  }

  retry = () => {
    if (!this.enabled) return;
    if (this.pending || this.timer) { this.dirty = true; return; }
    this.request('');
  };

  receive(frame: Record<string, unknown>) {
    if (frame.type === 'saved-contacts-changed') { this.retry(); return true; }
    if (frame.type !== 'saved-contacts') return false;
    if (!this.enabled || !this.pending || frame.id !== this.pending.id) return true;
    const previous = this.pending.cursor;
    clearTimeout(this.timer); this.timer = undefined; this.pending = undefined;
    if (frame.error || !Array.isArray(frame.users) || frame.users.length > PAGE_SIZE) return this.fail();
    const users = frame.users.map(parseAccount);
    if (users.some(user => !user)) return this.fail();
    const cursor = frame.cursor;
    if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 80
      || cursor && (cursor <= previous || cursor !== users.at(-1)?.id))) return this.fail();
    this.mergeSaved(users as LoungeAccount[]);
    this.options.update({ contactsSyncError: false });
    if (cursor || this.dirty) {
      const next = typeof cursor === 'string' && cursor ? cursor : '';
      if (!next) this.dirty = false;
      // Each page can trigger presence/profile subscriptions; leave room in the 30-requests/10s budget.
      this.timer = setTimeout(() => { this.timer = undefined; this.request(next); }, PAGE_DELAY_MS);
    }
    return true;
  }

  private request(cursor: string) {
    if (!this.enabled || this.pending) return;
    const id = `saved-contacts-${++this.sequence}`;
    this.pending = { id, cursor };
    this.timer = setTimeout(() => this.fail(), REQUEST_TIMEOUT_MS);
    if (!this.options.send({ type: 'sync-contacts', id, cursor })) this.fail();
  }

  private fail() {
    clearTimeout(this.timer); this.timer = undefined; this.pending = undefined;
    this.options.update({ contactsSyncError: true });
    return true;
  }

  private mergeSaved(users: LoungeAccount[]) {
    const state = this.options.snapshot();
    let contacts = state.contacts;
    const changed = new Set<string>();
    for (const user of users) {
      if (user.id === state.user?.id || user.account === this.options.account) continue;
      const contact = { user: this.options.profile(user), direct: true };
      if (sameContact(contacts.find(value => value.user.id === user.id), contact)) continue;
      contacts = mergeContact(contacts, contact); changed.add(user.id);
    }
    if (!changed.size) return;
    this.options.update({ contacts }); this.options.watch();
    for (const contact of contacts) if (changed.has(contact.user.id)) this.options.persist(contact);
  }
}

function sameContact(previous: LoungeContact | undefined, contact: LoungeContact) {
  return previous && (!contact.direct || previous.direct) && previous.user.account === contact.user.account
    && (!contact.user.avatar || previous.user.avatar === contact.user.avatar)
    && (contact.user.nickname === undefined || previous.user.nickname === contact.user.nickname)
    && (contact.user.remark === undefined || previous.user.remark === contact.user.remark)
    && (contact.lastMessageAt ?? 0) <= (previous.lastMessageAt ?? 0)
    && (contact.pinned === undefined || previous.pinned === contact.pinned);
}
