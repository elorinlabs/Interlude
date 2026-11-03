import type { LoungeAccount, LoungeMessage } from './types';
import { avatarData } from './avatar';
import { validName, MAX_NICKNAME, MAX_REMARK } from './names';

export interface LoungeContact {
  user: LoungeAccount;
  direct: boolean;
  online?: boolean | null;
  lastMessageAt?: number;
  pinned?: boolean;
}

export function parseAccount(input: unknown): LoungeAccount | undefined {
  if (!input || typeof input !== 'object') return;
  const user = input as Partial<LoungeAccount>;
  if (typeof user.id !== 'string' || !user.id || user.id.length > 80
    || typeof user.account !== 'string' || !user.account || [...user.account].length > 320) return;
  return { id: user.id, account: user.account, avatar: avatarData(user.avatar) ? user.avatar : undefined,
    ...(validName(user.nickname, MAX_NICKNAME) ? { nickname: user.nickname } : {}),
    ...(validName(user.remark, MAX_REMARK) ? { remark: user.remark } : {}) };
}

export function parseContact(input: unknown): LoungeContact | undefined {
  if (!input || typeof input !== 'object') return;
  const value = input as Partial<LoungeContact>;
  const user = parseAccount(value.user);
  if (user && typeof value.direct === 'boolean') return { user, direct: value.direct,
    ...(typeof value.lastMessageAt === 'number' && Number.isFinite(value.lastMessageAt) && value.lastMessageAt >= 0
      ? { lastMessageAt: value.lastMessageAt } : {}),
    ...(typeof value.pinned === 'boolean' ? { pinned: value.pinned } : {}) };
}

export function mergeContact(contacts: LoungeContact[], incoming: LoungeContact): LoungeContact[] {
  const previous = contacts.find(contact => contact.user.id === incoming.user.id);
  const updated = { ...previous, ...incoming, direct: incoming.direct || !!previous?.direct,
    user: { ...incoming.user, avatar: incoming.user.avatar ?? previous?.user.avatar,
      nickname: incoming.user.nickname ?? previous?.user.nickname, remark: incoming.user.remark ?? previous?.user.remark } };
  if (updated.direct) updated.lastMessageAt = Math.max(previous?.lastMessageAt ?? 0, incoming.lastMessageAt ?? 0);
  if (previous?.pinned !== undefined || incoming.pinned !== undefined) updated.pinned = incoming.pinned ?? previous?.pinned;
  return [...contacts.filter(contact => contact.user.id !== incoming.user.id), updated];
}

/** Pinning partitions the list; both sections use message time, never presence, drafts or read receipts. */
export function orderedDirectContacts(contacts: LoungeContact[], self?: string) {
  return contacts.filter(contact => contact.direct && contact.user.id !== self).sort((a, b) =>
    Number(!!b.pinned) - Number(!!a.pinned) || (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)
    || a.user.id.localeCompare(b.user.id));
}

export const messageConversation = (message: LoungeMessage, self: string) =>
  message.recipient ? (message.sender.id === self ? message.recipient.id : message.sender.id) : '';

export function contactStatus(contact: LoungeContact) {
  if (contact.online === null) return 'client.lounge.presenceHidden';
  if (contact.online === undefined) return 'client.lounge.presencePending';
  return contact.online ? 'client.lounge.userOnline' : 'client.lounge.userOffline';
}

export const sendError = (error: unknown) => error instanceof Error
  && ['client.lounge.muted', 'client.lounge.directUnavailable', 'client.lounge.awaitingReply'].includes(error.message)
  ? error.message : 'client.lounge.sendFailed';
