import { useId } from 'react';
import { Alert, Button, Form, Input, Modal, Spin } from 'antd';
import type { SshApi } from './ssh';
import { sshLabel, type SshProfile } from './sshProfiles';
import type { TerminalInfo } from './types';
import { useSavedSshConnection } from './useSavedSshConnection';
import { validSshValues } from './useSshConnection';
import { SshPrivateKeyInput } from './SshPrivateKeyInput';
import { displayText as t } from '../localization/messages';
import { remoteErrorText } from '../localization/errors';
import './ssh.css';
import { SshHostKeyDialog } from './SshHostKeyDialog';

export function SshQuickConnectDialog({ api, profile, projectCwd, connected, dispose, close }: {
  api: SshApi; profile: SshProfile; projectCwd: string; connected: (info: TerminalInfo) => void;
  dispose: (id: string) => Promise<void>; close: () => void;
}) {
  const connection = useSavedSshConnection({ api, profile, projectCwd, connected, dispose, close });
  const keyId = useId();
  const { busy, loading, finished, error, trust, values, needsCredentials, setCredential } = connection;
  const disabled = busy || loading || finished;
  const connectLabel = t(trust ? 'client.ssh.trustAndConnect' : 'client.ssh.connectAction');
  return <Modal open centered width={400} title={t('client.ssh.connection')} onCancel={close}
    className="ssh-quick-connect" footer={null} maskClosable={!busy} closable={!busy} keyboard={!busy}>
    <p className="ssh-quick-endpoint">{sshLabel(profile)}</p>
    <Form layout="vertical" disabled={disabled} onFinish={() => void connection.connect()}>
      {needsCredentials && <>
        <p>{t('client.ssh.loginHint')}</p>
        {profile.auth === 'key' ? <>
          <Form.Item label={t('client.ssh.privateKey')} htmlFor={keyId}>
            <SshPrivateKeyInput id={keyId} disabled={disabled} value={values.privateKey ?? ''}
              onChange={value => setCredential('privateKey', value)} />
          </Form.Item>
          <Form.Item label={t('client.ssh.passphrase')}>
            <Input.Password aria-label={t('client.ssh.passphrase')} autoComplete="new-password" maxLength={4096}
              value={values.passphrase ?? ''} onChange={event => setCredential('passphrase', event.target.value)} />
          </Form.Item>
        </> : <Form.Item label={t('client.ssh.password')}>
          <Input.Password aria-label={t('client.ssh.password')} autoComplete="new-password" maxLength={4096}
            value={values.password ?? ''} onChange={event => setCredential('password', event.target.value)} />
        </Form.Item>}
      </>}
      <div aria-live="polite" className="ssh-quick-feedback">
        {(busy || loading) && <Spin tip={t('client.ssh.connecting')}><div style={{ minHeight: 64 }} /></Spin>}
        {trust && !trust.previousFingerprints && <Alert type="warning" showIcon message={t('client.ssh.trustHost')}
          description={<code>{trust.fingerprint}</code>} />}
        {error && <Alert type="error" showIcon role="alert" message={remoteErrorText(error)}
          action={<Button size="small" disabled={busy} onClick={() => void connection.refresh()}>
            {t('client.ssh.refresh')}</Button>} />}
      </div>
      <div className="ssh-quick-actions">
        <Button disabled={busy} onClick={close}>{t('client.ssh.cancel')}</Button>
        {!finished && <Button type="primary" htmlType="submit" loading={busy} aria-label={connectLabel}
          disabled={disabled || (needsCredentials && !validSshValues(values))}>
          {connectLabel}
        </Button>}
      </div>
    </Form>
    <SshHostKeyDialog trust={trust} busy={busy} confirm={() => { void connection.confirmTrust(); }}
      cancel={connection.clearTrust} />
  </Modal>;
}
