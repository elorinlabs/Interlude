import { Drawer, Modal } from 'antd';
import { ChevronLeft } from 'lucide-react';
import { displayText as t } from '../localization/messages';
import { contactStatus } from './contacts';
import { LoungeAvatar } from './LoungeAvatar';
import type { MobileLounge } from './useMobileLounge';
import './profile.css';
import { LoungeNameFields } from './LoungeNameFields';
import { accountName } from './names';
import type { LoungeController } from './controller';

const PROFILE_LAYER = 1100;
const DELETE_LAYER = 1200;

export function MobileLoungeProfile({ model, controller }: { model: MobileLounge; controller: LoungeController }) {
  const user = model.profile;
  const own = user?.id === model.state.user?.id;
  const contact = model.state.contacts.find(value => value.user.id === user?.id);
  return <Drawer open={!!user} placement="right" width="100%" closable={false} zIndex={PROFILE_LAYER}
    title={t('client.lounge.profile')} rootClassName="lounge-profile-drawer" push={false}
    onClose={() => model.setProfile(undefined)} styles={{ header: { display: 'none' }, body: { padding: 0 } }}>
    {user && <section className="lounge-profile">
      <header className="lounge-mobile-heading">
        <button type="button" aria-label={t('client.lounge.profileBack')} onClick={() => model.setProfile(undefined)}>
          <ChevronLeft size={22} /></button><h1>{t('client.lounge.profile')}</h1>
      </header>
      <div className="lounge-profile-cover" aria-hidden />
      <div className="lounge-profile-details">
        <LoungeAvatar user={user} onProfile={own ? () => model.setAvatar(true) : undefined} /><h2>{accountName(user)}</h2>
        {accountName(user) !== user.account && <p className="lounge-profile-email">{user.account}</p>}
        {contact?.direct && <p className="lounge-profile-status">
          <i className={model.state.status === 'connected' && contact.online === true ? 'is-online' : ''} />
          {t(contactStatus(contact))}</p>}
        <LoungeNameFields key={user.id} user={user} state={model.state} controller={controller} />
      </div>
      <footer className="lounge-profile-actions">
        {own ? <button type="button" className="lounge-profile-send" onClick={() => model.setAvatar(true)}>
          {t('client.lounge.editAvatar')}</button> : <><button type="button" className="lounge-profile-delete" disabled={!model.state.directResetAvailable
          || model.state.status !== 'connected'} onClick={() => model.setDeleting(user)}>{t('client.lounge.deleteChat')}</button>
        <button type="button" className="lounge-profile-send" disabled={!model.state.directAvailable}
          onClick={() => model.select(user)}>{t('client.lounge.sendMessage')}</button></>}
      </footer>
    </section>}
  </Drawer>;
}

export function LoungeDeleteDialog({ model }: { model: MobileLounge }) {
  return <Modal open={!!model.deleting} width={400} zIndex={DELETE_LAYER} title={t('client.lounge.deleteTitle')}
    okText={t('client.lounge.deleteChat')} cancelText={t('client.lounge.cancel')} confirmLoading={model.deleteBusy}
    okButtonProps={{ danger: true, 'aria-label': t('client.lounge.deleteChat') }}
    cancelButtonProps={{ disabled: model.deleteBusy, 'aria-label': t('client.lounge.cancel') }}
    maskClosable={!model.deleteBusy} closable={!model.deleteBusy}
    onOk={() => void model.deleteContact()} onCancel={() => { if (!model.deleteBusy) model.setDeleting(undefined); }}>
    <p>{t('client.lounge.deleteConfirm')}</p>
    {model.deleteError && <p role="alert">{t('client.lounge.deleteFailed')}</p>}
  </Modal>;
}
