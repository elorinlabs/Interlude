import updateCopy from '@interlude/i18n/copy/client/guiUpdate';
import { useState } from 'react';
import type { GuiToolsClient } from './guiTools';
import { useRemoteCliInstaller } from './useRemoteCliInstaller';

export interface GuiUpdateOptions {
  client: GuiToolsClient;
  active: boolean;
  connected: boolean;
  running: boolean;
}

/** Keep the version being confirmed fixed until the user confirms or cancels. */
export function useGuiUpdate({ client, active, connected, running }: GuiUpdateOptions) {
  const installer = useRemoteCliInstaller(client, active && connected);
  const [pending, setPending] = useState<{ client: GuiToolsClient; version: string } | null>(null);
  const confirmation = pending?.client === client ? pending.version : null;
  const available = !!installer.release && installer.release.version !== installer.version;
  const upToDate = installer.readable && !!installer.release && !available
    && !installer.checking && !installer.installing && !installer.error;
  const canCheck = active && connected && !installer.checking && !installer.installing;
  const canInstall = canCheck && installer.readable && available && !running;
  const canConfirm = canInstall && confirmation === installer.release?.version;
  const confirm = () => {
    if (!canConfirm) return;
    setPending(null);
    void installer.install();
  };
  let message = updateCopy.idle;
  if (available) message = updateCopy.available;
  if (upToDate) message = updateCopy.latest;
  if (!installer.checked) message = updateCopy.reading;
  if (installer.checking) message = updateCopy.checking;
  if (running && available && !installer.checking) message = updateCopy.busy;
  if (installer.installing) message = installer.progress?.phase === 'installing'
    ? updateCopy.installing : updateCopy.downloading;
  if (!connected) message = updateCopy.offline;
  const progress = installer.installing && installer.progress && installer.progress.total > 0
    ? Math.max(0, Math.min(100, Math.floor(installer.progress.downloaded / installer.progress.total * 100))) : null;
  let checkLabel = upToDate ? updateCopy.upToDate : updateCopy.check;
  if (installer.checking) checkLabel = updateCopy.checking;
  return { ...installer, available, checkLabel, message, progress, confirmation,
    canCheck, canInstall, canConfirm, confirm,
    requestInstall: () => {
      if (canInstall && installer.release) setPending({ client, version: installer.release.version });
    },
    cancel: () => setPending(null) };
}
