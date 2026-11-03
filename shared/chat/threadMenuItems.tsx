import { Archive, FolderOpen, Pencil, Pin, Split, Trash2 } from 'lucide-react';
import type { MessageTranslator } from '../localization/messages';

export function threadMenuItems({ pinned, archived, disabled, translate, openProject, openProjectDisabled }: {
  pinned: boolean; archived: boolean; translate: MessageTranslator;
  disabled: (action: 'pin' | 'rename' | 'fork' | 'archive' | 'delete') => boolean;
  openProject?: boolean; openProjectDisabled?: boolean;
}) {
  return [
    { key: 'pin', label: translate(pinned ? 'client.conversation.unpin' : 'client.conversation.pin'),
      icon: <Pin size={14} />, disabled: disabled('pin') },
    ...(openProject ? [{ key: 'openProject', label: translate('client.projectBrowser.openInExplorer'),
      icon: <FolderOpen size={14} />, disabled: openProjectDisabled }] : []),
    { key: 'rename', label: translate('client.projectBrowser.renamed'),
      icon: <Pencil size={14} />, disabled: disabled('rename') },
    { key: 'fork', label: translate('client.conversation.createBranch'),
      icon: <Split size={14} />, disabled: disabled('fork') },
    { key: 'archive', label: translate(archived
      ? 'client.workspaceActions.restoreConversation' : 'client.threadActions.archive'),
    icon: <Archive size={14} />, disabled: disabled('archive') },
    { key: 'delete', label: translate('client.projectBrowser.deleted'),
      icon: <Trash2 size={14} />, danger: true, disabled: disabled('delete') },
  ];
}
