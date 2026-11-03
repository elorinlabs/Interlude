import { Dialog, Toast } from 'antd-mobile';
import { useStartupUpdate } from '../../../../shared/app-update/useStartupUpdate';
import { t, useLanguage } from '../i18n';
import { reloadForUpdate, startupUpdateOptions } from './startupUpdate';
import { useIdleWebUpdate } from './useIdleWebUpdate';

export function StartupUpdatePrompt() {
  useLanguage();
  const update = useStartupUpdate(startupUpdateOptions);
  useIdleWebUpdate(update.release?.version);
  if (!update.release) return null;
  const ignore = async () => {
    try {
      await update.ignoreVersion();
    } catch {
      Toast.show({ icon: 'fail', content: t("client.settings.couldNotSavePleaseTryAgain") });
    }
  };
  return <Dialog visible title={t("client.settings.updateAvailable")} closeOnMaskClick={false}
    bodyStyle={{ width: 'calc(100vw - 48px)', maxWidth: 400 }}
    content={t("client.settings.interludeVIsAvailableRefreshThePageToUpdate", { version: update.release.version })}
    actions={[[
      { key: 'ignore', text: t("client.settings.skipThisVersion"), onClick: ignore },
      { key: 'update', text: t("client.settings.updateNow"), bold: true, onClick: reloadForUpdate },
    ]]} />;
}
