import type { Item } from '../remote-chat/client/types';
import { referenceKind } from '../../apps/desktop/src/pages/codexGui/conversationReferences';
import { visibleUserContent } from './conversationContext';

const REFERENCE_LABELS = { conversation: "client.workspaceActions.referenceAConversation", coze: 'Coze', plugin: "client.chat.plugins", file: "client.mobile.attachments", folder: "client.mobile.attachments" };

/** Read both live mentions and context envelopes retained in older conversation history. */
export function messageReferences(item: Item) {
  if (item.type !== 'userMessage') return [];
  const parts = visibleUserContent([...(item.content ?? []), ...(item.text ? [item.text] : [])]);
  const paths = new Set<string>();
  return parts.flatMap(part => {
    if (part.type !== 'mention' || !part.path || paths.has(part.path)) return [];
    paths.add(part.path);
    const kind = referenceKind(part.path);
    return [{ kind, path: part.path, name: part.name || part.path, label: REFERENCE_LABELS[kind] }];
  });
}
