import { useState } from 'react';
import { Button, InputNumber, Modal } from 'antd';
import { displayText as t } from '../localization/messages';
import { MAX_MUTE_MINUTES, type LoungeAccount } from './types';
import type { LoungeController } from './controller';

export function LoungeModeration({ user, controller, close }: {
  user: LoungeAccount; controller: LoungeController; close: () => void;
}) {
  const [minutes, setMinutes] = useState<number | null>(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const valid = minutes !== null && Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MUTE_MINUTES;
  const save = async (duration: number) => {
    if (busy) return;
    setBusy(true); setError(false);
    try { await controller.moderate(user.id, duration); close(); }
    catch { setError(true); }
    finally { setBusy(false); }
  };
  return <Modal open title={t('client.lounge.moderateTitle')} width={400} onCancel={close}
    maskClosable={!busy} closable={!busy} keyboard={!busy} footer={<>
      <Button disabled={busy} onClick={close}>{t('client.lounge.cancel')}</Button>
      <Button disabled={busy} onClick={() => void save(0)}>{t('client.lounge.unmute')}</Button>
      <Button type="primary" loading={busy} disabled={!valid} onClick={() => void save(minutes!)}>
        {t('client.lounge.mute')}</Button>
    </>}>
    <p style={{ overflowWrap: 'anywhere', marginBottom: 16 }}>{user.account}</p>
    <label className="lounge-duration-label">{t('client.lounge.duration')}
      <InputNumber min={1} max={MAX_MUTE_MINUTES} precision={0} value={minutes} onChange={setMinutes}
        disabled={busy} aria-label={t('client.lounge.duration')} style={{ width: '100%' }} />
    </label>
    <p className="lounge-composer-notice">{t('client.lounge.durationHint')}</p>
    {error && <p role="alert" className="lounge-composer-error">{t('client.lounge.moderationFailed')}</p>}
  </Modal>;
}
