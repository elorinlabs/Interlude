import { displayText, displayError } from '../../i18n/index';
import { Clipboard, EyeOff, LockKeyhole, ShieldCheck, VolumeX, X, type LucideIcon } from 'lucide-react';
import { AutoUnlockSettings } from './AutoUnlockSettings';
import type { SecuritySettingsProps } from '../../../../../shared/remote-desktop/security';
import { t } from '../../i18n';
import './securitySettings.css';

function Toggle({ icon: Icon, title, description, checked, disabled, change }: {
  icon: LucideIcon; title: string; description: string; checked: boolean; disabled: boolean; change: () => void;
}) {
  return <button type="button" className="rd-security-option" role="switch" aria-label={displayText(title)}
    aria-checked={checked} disabled={disabled} onClick={change}>
    <Icon size={23} aria-hidden="true" />
    <span className="rd-security-copy"><strong>{displayText(title)}</strong><small>{displayText(description)}</small></span>
    <span className="rd-security-switch" aria-hidden="true"><span /></span>
  </button>;
}

export function SecuritySettings(props: SecuritySettingsProps) {
  const { connected, control, supported, value, saving, error, update, privacy, clipboard, notice, close } = props;
  const disabled = !connected || !control || saving;
  return <aside className="rd-settings rd-security-settings" aria-label={t("client.remoteDesktop.security")}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
    <header><ShieldCheck size={26} aria-hidden="true" /><h2>{t("client.remoteDesktop.security")}</h2>
      <button type="button" className="rd-security-close" onClick={close} aria-label={t("client.remoteDesktop.closeSecurityOptions")}>
        <X size={22} /></button></header>
    {notice && <div className="rd-security-notice" role="status"><p>{displayError(notice.message)}</p>
      <button type="button" disabled={saving} onClick={notice.run}>{displayText(notice.label)}</button></div>}
    <div className="rd-security-scroll" tabIndex={0} role="region" aria-label={t("client.remoteDesktop.securitySettings")}>
      <AutoUnlockSettings {...props} />
      <Toggle icon={LockKeyhole} title="client.remoteDesktop.lockWhenDisconnected" checked={value.lockOnDisconnect}
        disabled={disabled || !supported} change={() => { void update({ lockOnDisconnect: !value.lockOnDisconnect }); }}
        description={supported ? "client.remoteDesktop.lockTheRemoteComputerWhenTheConnectionEndsOrIs" : "client.remoteDesktop.thisComputerDoesNotSupportThisSecurityOptionYet"} />
      <Toggle icon={VolumeX} title="client.remoteDesktop.muteRemoteSpeakers" checked={value.muteHost}
        disabled={disabled || !supported} change={() => { void update({ muteHost: !value.muteHost }); }}
        description={supported ? "client.remoteDesktop.muteTheRemoteSpeakersWhileKeepingAudioOnThisDevice" : "client.remoteDesktop.thisComputerDoesNotSupportThisSecurityOptionYet"} />
      <section className="rd-security-privacy" aria-label={t("client.remoteDesktop.remotePrivacyMode")}>
        <div className="rd-security-option-heading"><EyeOff size={23} aria-hidden="true" />
          <div className="rd-security-copy"><strong>{t("client.remoteDesktop.remotePrivacyMode")}</strong>
            <small>{t(privacy.available ? "client.remoteDesktop.hideTheRemoteComputerSScreenWhileYouContinueTo" : "client.remoteDesktop.privacyScreenIsUnavailableOnThisComputer")}</small>
          </div></div>
        <div className="rd-security-choices" role="group" aria-label={t("client.remoteDesktop.privacyMode")}>
          {[false, true].map(enabled => <button key={String(enabled)} type="button"
            disabled={disabled || !privacy.available} aria-pressed={privacy.enabled === enabled}
            onClick={() => { if (privacy.enabled !== enabled) void privacy.toggle(); }}>
            {t(enabled ? "client.configLabels.enabled" : "client.remoteDesktop.off")}</button>)}
        </div>
      </section>
      <Toggle icon={Clipboard} title="client.remoteDesktop.syncClipboard" checked={clipboard.enabled}
        disabled={!connected || !clipboard.available || saving || (!control && value.clipboardSync !== undefined)}
        change={clipboard.toggle}
        description="client.remoteDesktop.copyAndPasteBetweenThisDeviceAndTheRemoteComputer" />
      {!control && <p className="rd-security-hint">{t("client.remoteDesktop.viewOnly")}</p>}
    </div>
    {(error || saving || props.saved) && <div className="rd-security-feedback">
      {error ? <p className="rd-security-error" role="alert">{displayError(error)}</p>
        : <p className="rd-security-hint" role="status">
          {t(saving ? "client.projectBrowser.saving" : "client.remoteDesktop.savedOnTheRemoteComputerTheseSettingsApplyOnYour")}</p>}
    </div>}
  </aside>;
}
