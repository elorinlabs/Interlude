import { useRef, useState } from 'react';
import { Button, Modal } from 'antd';
import { displayText as t } from '../localization/messages';
import { prepareAvatar } from './avatar';
import { LoungeAvatar } from './LoungeAvatar';
import type { LoungeAccount } from './types';
import type { LoungeController } from './controller';

const AVATAR_EDITOR_LAYER = 1200;

export function LoungeAvatarSettings({ user, controller, close }: {
  user: LoungeAccount; controller: LoungeController; close: () => void;
}) {
  const [avatar, setAvatar] = useState(user.avatar ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const choose = async (file?: File) => {
    if (!file || working.current) return;
    working.current = true; setBusy(true); setError('');
    try { setAvatar(await prepareAvatar(file)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'client.lounge.imageFailed'); }
    finally { working.current = false; setBusy(false); }
  };
  const save = async () => {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await controller.setAvatar(avatar); close(); }
    catch { setError('client.lounge.avatarSaveFailed'); }
    finally { working.current = false; setBusy(false); }
  };
  return <Modal open width={400} zIndex={AVATAR_EDITOR_LAYER} title={t('client.lounge.avatarSettings')} onCancel={close}
    closable={!busy} maskClosable={!busy} keyboard={!busy} footer={<>
      <Button disabled={busy} onClick={close}>{t('client.lounge.cancel')}</Button>
      <Button type="primary" disabled={busy} onClick={save}>{t('client.lounge.save')}</Button>
    </>}>
    <div className="lounge-avatar-settings">
      <LoungeAvatar user={{ ...user, avatar }} />
      <p>{t('client.lounge.avatarHint')}</p>
      <div><Button loading={busy} onClick={() => picker.current?.click()}>{t('client.lounge.chooseAvatar')}</Button>
        <Button disabled={busy || !avatar} onClick={() => setAvatar('')}>{t('client.lounge.resetAvatar')}</Button></div>
      <input ref={picker} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={event => { void choose(event.target.files?.[0]); event.target.value = ''; }} />
      {error && <p className="lounge-composer-error" role="alert">{t(error)}</p>}
    </div>
  </Modal>;
}
