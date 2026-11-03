import { displayText as t } from '../localization/messages';
import type { ConversationRow } from './conversationRows';
import type { LoungeMessage } from './types';

/** Keep incoming unread text visible even when the conversation has an unsent draft. */
export function conversationPreviewText(row: ConversationRow) {
  if (row.user && row.unread > 0 && row.last) return messageText(row.last);
  if (row.draft?.text || row.draft?.images.length) return singleLine(t('client.lounge.draftPreview', {
    text: row.draft.text || t('client.lounge.quotedImages', { count: row.draft.images.length }) }));
  if (row.last) return messageText(row.last);
  return t(row.user ? 'client.lounge.directEmpty' : 'client.lounge.emptyHint');
}

function messageText(message: LoungeMessage) {
  return singleLine(message.text) || t('client.lounge.quotedImages', { count: message.images.length });
}

function singleLine(text: string) { return text.replace(/\s+/g, ' ').trim(); }
