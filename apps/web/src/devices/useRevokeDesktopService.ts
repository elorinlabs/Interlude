import { t } from '../i18n';
import { useRef } from 'react';
import { Dialog, Toast } from 'antd-mobile';
import { apiJson } from '../api';
import type { RemoteDevice } from '../types';

export function useRevokeDesktopService() {
  const busy = useRef(false);
  return async (device: RemoteDevice) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const confirmed = await Dialog.confirm({ title: t("client.mobile.revokeUnattendedAccess.aee3c8"),
        content: t("client.mobile.afterRevokingEnableUnattendedAccessAgainOnTheComputerTo"),
        confirmText: t("client.mobile.revokeAccess"),
        bodyStyle: { maxWidth: 400, width: 'calc(100vw - 32px)' } });
      if (!confirmed) return;
      await apiJson(`/devices/${encodeURIComponent(device.deviceId)}/service-credential`, { method: 'DELETE' });
      Toast.show({ content: t("client.mobile.unattendedAccessRevoked") });
    } catch { Toast.show({ content: t("client.mobile.couldNotRevokeAccessCheckYourConnectionAndTryAgain") }); }
    finally { busy.current = false; }
  };
}
