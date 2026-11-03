import { useState, type HTMLAttributes, type ReactElement } from 'react';
import { message as toast } from 'antd';
import { ThreadContextMenu } from '../chat/ThreadContextMenu';
import { displayText as t } from '../localization/messages';
import type { LoungeMessage } from './types';
import { copyLoungeMessage } from './clipboard';
import './contextMenu.css';

export interface LoungeMessageMenuActions {
  reply: (message: LoungeMessage) => void;
  direct?: () => void; block?: () => void; blocked?: boolean;
}

export function LoungeMessageMenu({ message, reply, children, direct, block, blocked }: LoungeMessageMenuActions & {
  message: LoungeMessage;
  children: ReactElement<HTMLAttributes<HTMLElement>>;
}) {
  const [open, setOpen] = useState(false);
  const [notice, holder] = toast.useMessage();
  const copy = async () => {
    try {
      await copyLoungeMessage(message);
      void notice.success({ content: t('client.lounge.messageCopied'), className: 'lounge-copy-notice' });
    } catch {
      void notice.error({ content: t('client.lounge.messageCopyFailed'), className: 'lounge-copy-notice' });
    }
  };
  return <>{holder}<ThreadContextMenu open={open} onOpenChange={setOpen} overlayClassName="lounge-context-menu"
    menu={{ items: [{ key: 'copy', label: t('client.lounge.copyMessage') },
      { key: 'reply', label: t('client.lounge.quoteReply') },
      ...(direct ? [{ key: 'direct', label: t('client.lounge.directChat') }] : []),
      ...(block ? [{ key: 'block', label: t(blocked ? 'client.lounge.unblockUser' : 'client.lounge.blockUser') }] : [])],
      onClick: ({ key }) => {
        setOpen(false);
        if (key === 'copy') void copy();
        else if (key === 'direct') direct?.();
        else if (key === 'block') block?.();
        else reply(message);
      } }}>{children}</ThreadContextMenu></>;
}
