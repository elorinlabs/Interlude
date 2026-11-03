import type { LoungeMessage } from './types';

export const MAX_REPLY_TEXT = 280;
export interface LoungeReply { id: string; senderId: string; account: string; text: string; imageCount: number }

/** Quotes carry a bounded snapshot, so recipients do not need a server history lookup. */
export function quoteMessage(message: LoungeMessage): LoungeReply {
  const characters = Array.from(message.text);
  const text = characters.length > MAX_REPLY_TEXT
    ? `${characters.slice(0, MAX_REPLY_TEXT - 1).join('')}…` : message.text;
  return { id: message.id, senderId: message.sender.id, account: message.sender.account,
    text, imageCount: message.images.length };
}

export function parseReply(input: unknown): LoungeReply | undefined {
  if (!input || typeof input !== 'object') return;
  const reply = input as Partial<LoungeReply>;
  if (typeof reply.id !== 'string' || !reply.id || reply.id.length > 80
    || typeof reply.senderId !== 'string' || !reply.senderId || reply.senderId.length > 80
    || typeof reply.account !== 'string' || !reply.account.trim() || Array.from(reply.account).length > 320
    || typeof reply.text !== 'string' || Array.from(reply.text).length > MAX_REPLY_TEXT
    || typeof reply.imageCount !== 'number' || !Number.isInteger(reply.imageCount)
    || reply.imageCount < 0 || reply.imageCount > 3 || !reply.text.trim() && !reply.imageCount) return;
  return { id: reply.id, senderId: reply.senderId, account: reply.account, text: reply.text,
    imageCount: reply.imageCount };
}
