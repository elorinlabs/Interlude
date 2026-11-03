import { avatarData, type LoungeAvatarStore } from './avatar';
import type { LoungeAccount, LoungeMessage, LoungeSnapshot } from './types';
import { LoungeNames } from './names';

const MAX_PROFILES = 200;

function mapChanged<T>(values: T[], transform: (value: T) => T): T[] {
  const updated = values.map(transform);
  return updated.some((value, index) => value !== values[index]) ? updated : values;
}

/** Server profiles override message snapshots and local caches, including explicit resets. */
export class LoungeProfiles {
  readonly names = new LoungeNames();
  available = false;
  private avatars = new Map<string, string>();
  private watched = '';

  clear() { this.avatars.clear(); this.names.clear(); this.disconnect(); }
  disconnect() { this.watched = ''; this.available = false; this.names.available = false; }
  ready(user: LoungeAccount, available: boolean, namesAvailable = false) {
    this.names.ready(user, namesAvailable);
    this.available = available;
    this.watched = '';
    if (available) this.avatars.set(user.id, avatarData(user.avatar) ? user.avatar : '');
  }
  receive(input: unknown) {
    if (!this.available || !Array.isArray(input) || input.length > MAX_PROFILES) return false;
    for (const profile of input) {
      if (typeof profile?.id === 'string' && profile.id.length > 0 && profile.id.length <= 80
        && (profile.avatar === '' || avatarData(profile.avatar))) this.avatars.set(profile.id, profile.avatar);
    }
    return true;
  }
  user(user: LoungeAccount): LoungeAccount {
    user = this.names.user(user);
    if (!this.avatars.has(user.id)) return user;
    const avatar = this.avatars.get(user.id) || undefined;
    return avatar === user.avatar ? user : { ...user, avatar };
  }
  message = (message: LoungeMessage): LoungeMessage => {
    const sender = this.user(message.sender);
    const recipient = message.recipient ? this.user(message.recipient) : undefined;
    return sender === message.sender && recipient === message.recipient ? message : { ...message, sender, recipient };
  };
  decorate(state: LoungeSnapshot): LoungeSnapshot {
    // Preserve unchanged lists: presence and acknowledgements must not reset the chat viewport.
    return { ...state, user: state.user ? this.user(state.user) : undefined,
      messages: mapChanged(state.messages, this.message),
      contacts: mapChanged(state.contacts, contact => {
        const user = this.user(contact.user);
        return user === contact.user ? contact : { ...contact, user };
      }) };
  }
  cache(user: LoungeAccount | undefined, store?: LoungeAvatarStore) {
    if (!user || !this.avatars.has(user.id)) return;
    // The server has already accepted this value. A failed offline cache must not undo the save.
    try { store?.save(user.id, this.avatars.get(user.id) ?? ''); } catch { /* Best-effort offline cache. */ }
  }
  watch(socket: WebSocket, state: LoungeSnapshot) {
    if (!this.available) return;
    const ids = [...new Set([state.conversation, ...state.contacts.map(contact => contact.user.id).reverse()])]
      .filter(id => id && id !== state.user?.id).slice(0, MAX_PROFILES);
    const serialized = JSON.stringify(ids);
    if (serialized === this.watched || !ids.length && !this.watched) return;
    const retained = new Set([...ids, state.user?.id]);
    for (const id of this.avatars.keys()) if (!retained.has(id)) this.avatars.delete(id);
    socket.send(JSON.stringify({ type: 'profile-watch', watch: ids }));
    this.watched = serialized;
  }
}
