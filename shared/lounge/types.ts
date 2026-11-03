import type { LoungeAvatarStore } from './avatar';
import type { LoungeHistoryStore } from './archive';
import { parseReply, type LoungeReply } from './reply';
import { parseAccount, type LoungeContact } from './contacts';
import { parseDelivery, type LoungeDelivery } from './delivery';

export const MAX_TEXT = 4000;
export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_FRAME_BYTES = 6 * 1024 * 1024;
export const MAX_MUTE_MINUTES = 30 * 24 * 60;
export interface LoungeAccount {
  id: string; account: string; avatar?: string; nickname?: string;
  /** Private label for the current account; presentation/cache only, never transmitted to other users. */
  remark?: string;
}
export interface LoungeMessage {
  type: 'message'; id: string; sender: LoungeAccount; text: string; images: string[]; sentAt: string;
  reply?: LoungeReply;
  recipient?: LoungeAccount;
  conversation?: string;
  receipts?: boolean;
  delivery?: LoungeDelivery;
  generation?: number;
}
export interface LoungeDraft { text: string; images: string[]; reply?: LoungeReply; to?: string }
export interface LoungePolicy { moderator: boolean; mutedUntil: string | null }
export interface LoungeSession {
  sync?: import('./syncConnection').LoungeSyncTransport;
  baseUrl: string;
  account?: string;
  authorize: () => Promise<{ ticket: string }>;
  avatars?: LoungeAvatarStore;
  history?: LoungeHistoryStore;
}
export interface LoungeSnapshot {
  status: 'signed-out' | 'connecting' | 'connected';
  messages: LoungeMessage[];
  user?: LoungeAccount;
  unread: number;
  notificationSettingsAvailable?: boolean;
  mutedConversations?: string[];
  policy: LoungePolicy;
  historyRevision: number;
  historyError: boolean;
  contactsSyncError?: boolean;
  deviceSyncError?: boolean;
  onlineCount?: number;
  contacts: LoungeContact[];
  blocked: string[];
  directAvailable: boolean;
  accountLookupAvailable?: boolean;
  namesAvailable?: boolean;
  directResetAvailable?: boolean;
  conversation: string;
  unreadByConversation: Record<string, number>;
}

export function imageData(value: unknown): value is string {
  return typeof value === 'string' && value.length <= Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32
    && /^data:image\/(png|jpeg|gif);base64,[A-Za-z0-9+/]+=*$/.test(value);
}

export function parseMessage(value: unknown): LoungeMessage | undefined {
  if (!value || typeof value !== 'object') return;
  const item = value as Partial<LoungeMessage>;
  if (item.type !== 'message' || typeof item.id !== 'string' || item.id.length > 80
    || typeof item.sender?.id !== 'string' || typeof item.sender.account !== 'string'
    || typeof item.text !== 'string' || [...item.text].length > MAX_TEXT
    || !Array.isArray(item.images) && item.images != null
    || typeof item.sentAt !== 'string' || !Number.isFinite(Date.parse(item.sentAt))) return;
  const images = item.images ?? [];
  if (images.length > MAX_IMAGES || !images.every(imageData)) return;
  const recipient = parseAccount(item.recipient);
  if (item.generation !== undefined && (!Number.isSafeInteger(item.generation) || item.generation < 0)) return;
  if (item.recipient && !recipient) return;
  const sender = parseAccount(item.sender);
  if (!sender) return;
  return { ...item, sender, images, recipient, reply: parseReply(item.reply),
    receipts: item.receipts === true || undefined, delivery: parseDelivery(item.delivery),
    conversation: typeof item.conversation === 'string' ? item.conversation : undefined } as LoungeMessage;
}

export function initials(account: string) { return Array.from(account).slice(0, 2).join('').toUpperCase(); }
