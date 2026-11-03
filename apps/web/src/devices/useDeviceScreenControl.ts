import { Toast } from 'antd-mobile';
import { useDeviceScreenControl as useScreenControl } from '../../../../shared/remote-desktop/useDeviceScreenControl';
import { apiJson } from '../api';
import { t } from '../i18n';
import { useAppSelector } from '../hooks';

export function useDeviceScreenControl() {
  const session = useAppSelector(state => state.auth.session);
  return useScreenControl({
    scope: JSON.stringify([session?.baseUrl, session?.email]),
    request: apiJson,
    notify: message => { Toast.show({ content: t(message), position: 'top' }); },
  });
}
