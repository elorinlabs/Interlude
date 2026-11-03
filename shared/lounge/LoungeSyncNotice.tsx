import { displayText as t } from '../localization/messages';
import type { LoungeController } from './controller';

export function LoungeSyncNotice({ failed, controller }: { failed?: boolean; controller: LoungeController }) {
  if (!failed) return null;
  return <p className="lounge-history-warning" role="alert">{t('client.lounge.deviceSyncFailed')}
    <button type="button" onClick={() => controller.retryDeviceSync()}>{t('client.lounge.historyRetry')}</button>
  </p>;
}
