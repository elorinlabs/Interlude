import { displayError } from '../i18n/index';
import { useState } from 'react';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { t } from '../i18n';

export function HostIdentityVerification({ confirm, close }: {
  confirm: (fingerprint: string) => Promise<void>; close: () => void;
}) {
  const [fingerprint, setFingerprint] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await confirm(fingerprint); close(); }
    catch (error) { setError(error instanceof Error ? error.message : '电脑身份未能更新，请重试。'); }
    finally { setBusy(false); }
  };
  return <AdaptiveSheet open title={t("client.remoteDesktop.verifyComputerIdentity")} width={400} onClose={close}>
    <div className="chat-settings" style={{ maxWidth: 400 }}>
      <p>{t("client.remoteDesktop.openRemoteDesktopInTheComputerSSettingsCopyIts")}</p>
      <input aria-label={t("client.remoteDesktop.deviceFingerprint")} value={fingerprint} maxLength={100} autoComplete="off"
        style={{ width: '100%', boxSizing: 'border-box' }} onChange={event => setFingerprint(event.target.value)} />
      {!!error && <p role="alert">{displayError(error)}</p>}
      <button className="chat-button chat-primary" disabled={busy || !fingerprint.trim()} onClick={() => void submit()}>
        {t("client.remoteDesktop.verifyAndReconnect")}</button>
    </div>
  </AdaptiveSheet>;
}
