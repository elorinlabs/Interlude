import { displayError } from '../i18n/index';
import { useMemo, useState } from 'react';
import { Button } from 'antd-mobile';
import { apiJson, getActiveSession } from '../api';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { t } from '../i18n';
import { useDesktopUpdate } from '../../../../shared/desktop-update/useDesktopUpdate';
import type { UpdateConnectionOptions } from '../../../../shared/desktop-update/connection';
import './desktop-version.css';

export function DesktopVersionSheet({ onClose, connectionOptions }: {
  onClose: () => void; connectionOptions?: UpdateConnectionOptions;
}) {
  const options = useMemo(() => connectionOptions ?? { authorize: async () => {
    await apiJson('/auth/me');
    const session = getActiveSession();
    if (!session) throw new Error('请重新登录。');
    return session;
  } }, [connectionOptions]);
  const update = useDesktopUpdate(options);
  const [confirmation, setConfirmation] = useState<{ deviceId: string; version: string } | null>(null);
  const status = update.status;
  const canConfirm = update.canInstall && confirmation?.deviceId === update.selectedId
    && confirmation.version === status?.latestVersion;
  const install = () => {
    if (!canConfirm || !confirmation) return;
    update.install(confirmation.version);
    setConfirmation(null);
  };
  return <AdaptiveSheet open title={confirmation ? t("client.settings.installDesktopUpdate") : t("client.settings.desktopVersion")} onClose={onClose} width={400}>
    <div className="desktop-version">
      {confirmation ? <>
        <strong>{update.device?.name} · v{confirmation.version}</strong>
        <p>{t("client.settings.theDesktopAppWillRestartActiveConnectionsAndTasksMay")}</p>
        <div className="desktop-version-actions">
          <Button onClick={() => setConfirmation(null)}>{t("client.settings.notNow")}</Button>
          <Button color="primary" disabled={!canConfirm} onClick={install}>{t("client.settings.installAndRestart")}</Button>
        </div>
      </> : <>
        <label htmlFor="desktop-version-device">{t("client.settings.chooseAComputer")}</label>
        {!update.connected && <p>{t("client.settings.connecting")}</p>}
        {update.connected && !update.devices.length && <p>{t("client.settings.noComputersYetSignInToTheDesktopAppWith")}</p>}
        {!!update.devices.length && <select id="desktop-version-device" value={update.selectedId}
          onChange={(event) => update.select(event.target.value)}>
          {update.devices.map((device) => <option key={device.deviceId} value={device.deviceId}>
            {device.name} · {device.platform} · {t(device.online ? "client.chat.online" : "client.chat.offline")}
          </option>)}
        </select>}
        {update.device && <>
          <dl><dt>{t("client.settings.version")}</dt><dd>{status?.currentVersion || update.device.appVersion || t("client.settings.versionUnavailable")}</dd>
            {status?.latestVersion && <><dt>{t("client.settings.availableVersion")}</dt><dd>v{status.latestVersion}</dd></>}
          </dl>
          {(!status || !update.connected || !update.device.online) && update.device.appVersion
            && <p>{t("client.settings.versionFromTheLastConnection")}</p>}
          <p role="status">{displayError(update.message)}</p>
          {status?.phase === 'downloading' && status.progress !== null
            && <progress aria-label={t("client.downloads.downloadProgress")} max={100} value={status.progress} />}
          {status?.notes && <div className="desktop-version-notes">{status.notes}</div>}
        </>}
        <div className="desktop-version-actions">
          <Button disabled={!update.canCheck} onClick={update.check}>{t("client.settings.checkForUpdates")}</Button>
          <Button color="primary" disabled={!update.canInstall} onClick={() => {
            if (status?.latestVersion) setConfirmation({ deviceId: update.selectedId, version: status.latestVersion });
          }}>{t("client.settings.installUpdate")}</Button>
        </div>
      </>}
      {!!update.error && <p role="alert" className="desktop-version-error">{displayError(update.error)}</p>}
    </div>
  </AdaptiveSheet>;
}
