import { Modal } from 'antd';
import type { SshHostTrust } from './sshHostTrust';
import { displayText as t } from '../localization/messages';

export function SshHostKeyDialog({ trust, busy, confirm, cancel }: {
  trust?: SshHostTrust; busy: boolean; confirm: () => void; cancel: () => void;
}) {
  if (!trust?.previousFingerprints) return null;
  return <Modal open centered width={400} title={t('client.ssh.hostKeyChangedTitle')} confirmLoading={busy}
    onOk={confirm} onCancel={cancel} maskClosable={false} closable={!busy} keyboard={!busy}
    okText={t('client.ssh.updateFingerprint')} cancelText={t('client.ssh.cancel')} cancelButtonProps={{ disabled: busy }}>
    <p>{t('client.ssh.hostKeyChangedHint')}</p>
    <p>{t('client.ssh.previousFingerprint')}</p>
    {trust.previousFingerprints.map(value => <p key={value}><code style={{ overflowWrap: 'anywhere' }}>{value}</code></p>)}
    <p>{t('client.ssh.currentFingerprint')}</p>
    <p><code style={{ overflowWrap: 'anywhere' }}>{trust.fingerprint}</code></p>
  </Modal>;
}
