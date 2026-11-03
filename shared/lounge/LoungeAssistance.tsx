import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button, Modal, Popconfirm } from 'antd';
import { Handshake } from 'lucide-react';
import { displayText as t } from '../localization/messages';
import { getInterfaceLanguage, subscribeInterfaceLanguage } from '../localization/interfaceLanguage';
import type { LoungeAccount } from './types';
import './assistance.css';

export type RequestLoungeAssistance = (email?: string) => void;
const AssistanceContext = createContext<RequestLoungeAssistance | undefined>(undefined);
export const useLoungeAssistance = () => useContext(AssistanceContext);

/** Desktop owns consent and capture; browsers explain where the invitation must be sent. */
export function LoungeAssistanceProvider({ request, children }: {
  request?: RequestLoungeAssistance; children: ReactNode;
}) {
  useSyncExternalStore(subscribeInterfaceLanguage, getInterfaceLanguage);
  const [desktopHint, setDesktopHint] = useState<{ email?: string }>();
  return <AssistanceContext.Provider value={request ?? (email => setDesktopHint({ email }))}>
    {children}
    <Modal open={!!desktopHint} title={t('client.remoteAssistance.remoteAssistance')}
      width={440} styles={{ body: { maxWidth: 400 } }} onCancel={() => setDesktopHint(undefined)}
      footer={<Button type="primary" onClick={() => setDesktopHint(undefined)}>
        {t('client.lounge.assistance.understood')}</Button>}>
      <p className="lounge-assistance-copy">{t('client.lounge.assistance.desktopRequired')}</p>
      {desktopHint?.email && <p className="lounge-assistance-copy">
        {t('client.lounge.assistance.recipient', { email: desktopHint.email })}</p>}
    </Modal>
  </AssistanceContext.Provider>;
}

export function LoungeAssistanceConfirm({ user, children, open, onOpenChange }: {
  user: LoungeAccount; children: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const request = useLoungeAssistance();
  return <Popconfirm title={t('client.lounge.assistance.confirm', { email: user.account })}
    description={t('client.remoteAssistance.inviteSomeoneToViewAndControlThisComputerYouCan')}
    okText={t('client.remoteAssistance.sendInvitation')} cancelText={t('client.lounge.cancel')}
    icon={<Handshake size={17} />} placement="topRight" open={open}
    onOpenChange={value => { if (open === undefined || !value) onOpenChange?.(value); }}
    overlayClassName="lounge-assistance-confirm"
    styles={{ root: { maxWidth: 'min(400px, calc(100vw - 24px))' } }}
    onConfirm={() => request?.(user.account)}>{children}</Popconfirm>;
}

export function LoungeAssistanceButton({ user }: { user?: LoungeAccount }) {
  const request = useLoungeAssistance();
  const label = t('client.remoteAssistance.remoteAssistance');
  if (!request) return null;
  if (!user) return <button type="button" className="lounge-assistance-button" onClick={() => request()}>
    <Handshake size={18} aria-hidden />{label}</button>;
  return <LoungeAssistanceConfirm user={user}>
    <button type="button" className="lounge-assistance-button" aria-label={label} title={label}>
      <Handshake size={22} aria-hidden /></button>
  </LoungeAssistanceConfirm>;
}
