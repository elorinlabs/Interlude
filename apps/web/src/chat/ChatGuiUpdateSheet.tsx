import { displayError } from '../i18n/index';
import { Button } from 'antd-mobile';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { useGuiUpdate, type GuiUpdateOptions } from '../../../../shared/remote-chat/useGuiUpdate';
import { t } from '../i18n';
import '../settings/desktop-version.css';

export function ChatGuiUpdateSheet({ deviceName, onClose, onBack, ...options }: GuiUpdateOptions & {
  deviceName?: string; onClose: () => void; onBack: () => void;
}) {
  const update = useGuiUpdate(options);
  return <AdaptiveSheet open title={t(update.confirmation ? "client.app.installCodexGuiUpdate" : "client.app.updateCodexGui")}
    subtitle={deviceName || t("client.app.currentComputer")} width={400} onClose={onClose}
    onBack={update.confirmation ? update.cancel : onBack}>
    <div className="desktop-version">
      {update.confirmation ? <>
        <strong>v{update.confirmation}</strong>
        <p>{t("client.app.codexGuiWillUpdateOnThisComputerAndReconnectAutomatically")}</p>
      </> : <dl>
        <dt>{t("client.settings.version")}</dt><dd>{update.version ? `v${update.version}` : t("client.settings.versionUnavailable")}</dd>
        {update.available && update.release && <><dt>{t("client.settings.availableVersion")}</dt><dd>v{update.release.version}</dd></>}
      </dl>}
      <p role="status">{displayError(update.message)}</p>
      {update.progress !== null && <progress aria-label={t("client.downloads.downloadProgress")} max={100} value={update.progress} />}
      {!!update.error && <p role="alert" className="desktop-version-error">{displayError(update.error)}</p>}
      <div className="desktop-version-actions">
        {update.confirmation ? <>
          <Button onClick={update.cancel}>{t("client.settings.notNow")}</Button>
          <Button color="primary" disabled={!update.canConfirm} onClick={update.confirm}>{t("client.app.confirmInstallation")}</Button>
        </> : <>
          <Button disabled={!update.canCheck} onClick={update.check}>{displayError(update.checkLabel)}</Button>
          <Button color="primary" disabled={!update.canInstall} onClick={update.requestInstall}>{t("client.settings.installUpdate")}</Button>
        </>}
      </div>
    </div>
  </AdaptiveSheet>;
}
