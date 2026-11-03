import { Button, Modal } from 'antd';
import type { LoungeAccount, LoungeSnapshot } from './types';
import type { LoungeController } from './controller';
import { LoungeNameFields } from './LoungeNameFields';
import { LoungeAvatar } from './LoungeAvatar';
import { accountName } from './names';
import { displayText as t } from '../localization/messages';

export function LoungeDesktopProfile({ user, state, controller, close, editAvatar }: {
  user: LoungeAccount; state: LoungeSnapshot; controller: LoungeController; close: () => void; editAvatar: () => void;
}) {
  const current = user.id === state.user?.id ? state.user
    : state.contacts.find(contact => contact.user.id === user.id)?.user ?? user;
  const own = current.id === state.user?.id;
  return <Modal open width={400} title={t(own ? 'client.lounge.accountSettings' : 'client.lounge.profile')}
    onCancel={close} footer={null}>
    <section className="lounge-desktop-profile">
      <LoungeAvatar user={current} /><h2>{accountName(current)}</h2>
      {accountName(current) !== current.account && <p className="lounge-profile-email">{current.account}</p>}
      {own && <Button onClick={editAvatar}>{t('client.lounge.editAvatar')}</Button>}
      <LoungeNameFields key={current.id} user={current} state={state} controller={controller} />
    </section>
  </Modal>;
}
