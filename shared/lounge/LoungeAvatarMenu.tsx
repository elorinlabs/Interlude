import { useState, type ReactNode } from 'react';
import { ThreadContextMenu } from '../chat/ThreadContextMenu';
import { displayText as t } from '../localization/messages';
import { Handshake } from 'lucide-react';
import { LoungeAssistanceConfirm, useLoungeAssistance } from './LoungeAssistance';
import type { LoungeAccount } from './types';
import './contextMenu.css';

export function LoungeAvatarMenu({ children, mention, user }: {
  children: ReactNode; mention: () => void; user: LoungeAccount;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const assistance = useLoungeAssistance();
  const menu = <ThreadContextMenu open={open} onOpenChange={value => { setOpen(value); if (value) setConfirm(false); }}
    overlayClassName="lounge-context-menu"
    menu={{ items: [{ key: 'mention', label: t('client.lounge.mentionUser') },
      ...(assistance ? [{ key: 'assistance', label: t('client.remoteAssistance.remoteAssistance'),
        icon: <Handshake size={16} /> }] : [])],
    onClick: ({ key }) => { setOpen(false); if (key === 'assistance') setConfirm(true); else mention(); } }}>
    <span className="lounge-avatar-menu">{children}</span>
  </ThreadContextMenu>;
  return assistance ? <LoungeAssistanceConfirm user={user} open={confirm} onOpenChange={setConfirm}>
    <span className="lounge-avatar-menu">{menu}</span></LoungeAssistanceConfirm> : menu;
}
