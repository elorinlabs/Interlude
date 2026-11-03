import { displayText } from '../../i18n/index';
import { UnlockKeyhole } from 'lucide-react';
import { autoUnlockDescription, type SecuritySettingsProps } from '../../../../../shared/remote-desktop/security';
import { useAutoUnlockForm } from '../../../../../shared/remote-desktop/useAutoUnlockForm';
import { t } from '../../i18n';

export function AutoUnlockSettings(props: SecuritySettingsProps) {
  const form = useAutoUnlockForm(props);
  const state = props.value.autoUnlock;
  const disabled = !props.connected || !props.control || !props.supported || props.saving || !state;
  return <section className="rd-security-unlock">
    <button type="button" className="rd-security-option" role="switch" aria-label={t("client.remoteDesktop.automaticallyUnlockRemoteComputer")}
      aria-checked={state?.enabled ?? false} disabled={disabled} onClick={form.toggle}>
      <UnlockKeyhole size={23} aria-hidden="true" />
      <span className="rd-security-copy"><strong>{t("client.remoteDesktop.automaticallyUnlockRemoteComputer")}</strong>
        <small role="status">{displayText(autoUnlockDescription(state))}</small></span>
      <span className="rd-security-switch" aria-hidden="true"><span /></span>
    </button>
    {state?.enabled && !form.editing && <button type="button" className="rd-unlock-edit" disabled={disabled}
      onClick={form.edit}>{t("client.remoteDesktop.editSignInDetails")}</button>}
    {form.editing && <form className="rd-unlock-form" autoComplete="off" onSubmit={event => {
      event.preventDefault(); form.save();
    }} onKeyDown={event => event.stopPropagation()}>
      <label>{t("client.remoteDesktop.windowsAccount")}<input aria-label={t("client.remoteDesktop.windowsAccount")} value={form.username}
        autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={256} disabled={disabled}
        placeholder={t("client.remoteDesktop.windowsUsernamePlaceholder")}
        onChange={event => form.setUsername(event.target.value)} /></label>
      <label>{t("client.remoteDesktop.windowsPassword")}<input type="password" aria-label={t("client.remoteDesktop.windowsPassword")}
        autoComplete="new-password" value={form.password} maxLength={256} disabled={disabled}
        onChange={event => form.setPassword(event.target.value)} /></label>
      <p className="rd-security-hint">{t("client.remoteDesktop.useYourAccountPasswordNotAPinItIsStored")}</p>
      <div className="rd-security-choices">
        <button type="button" onClick={form.cancel}>{t("client.accounts.cancel")}</button>
        <button type="submit" disabled={disabled || !form.username.trim() || !form.password}>{t("client.remoteDesktop.saveAndEnable")}</button>
      </div>
    </form>}
  </section>;
}
