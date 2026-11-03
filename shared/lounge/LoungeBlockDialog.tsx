import { accountName } from './names';
import { useState } from 'react';
import { Modal } from 'antd';
import { displayText as t } from '../localization/messages';
import type { LoungeAccount } from './types';
import type { LoungeController } from './controller';

export function LoungeBlockDialog({ user, blocked, controller, close }: {
  user: LoungeAccount; blocked: boolean; controller: LoungeController; close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError(false);
    try { await controller.block(user.id, !blocked); close(); }
    catch { setError(true); }
    finally { setBusy(false); }
  };
  return <Modal open width={400} title={blocked ? t('client.lounge.unblockUser')
    : t('client.lounge.blockConfirm', { account: accountName(user) })} onCancel={() => { if (!busy) close(); }}
    confirmLoading={busy} onOk={() => void submit()} okText={t(blocked
      ? 'client.lounge.unblockUser' : 'client.lounge.blockUser')} cancelText={t('client.lounge.cancel')}>
    <p style={{ overflowWrap: 'anywhere' }}>{blocked ? user.account : t('client.lounge.blockHint')}</p>
    {error && <p role="alert">{t('client.lounge.actionFailed')}</p>}
  </Modal>;
}
