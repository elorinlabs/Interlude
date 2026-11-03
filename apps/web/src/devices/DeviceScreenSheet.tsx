import { Button, Drawer } from 'antd';
import { t, useLanguage } from '../i18n';
import type { RemoteDevice } from '../types';
import './screenSheet.css';

// Remain above the device dropdown during its closing animation.
const SCREEN_CONFIRMATION_Z_INDEX = 1100;

interface Props {
  device: RemoteDevice;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** A compact bottom drawer keeps the confirmation beside the device controls. */
export function DeviceScreenSheet({ device, open, onClose, onConfirm }: Props) {
  useLanguage();
  return <Drawer open={open} placement="bottom" height="auto" zIndex={SCREEN_CONFIRMATION_Z_INDEX}
    rootClassName="device-screen-sheet" onClose={onClose} destroyOnHidden
    closable={{ placement: 'end', 'aria-label': t('client.projectBrowser.close') }}
    title={<div className="device-screen-heading">
      <strong>{t('client.deviceScreen.confirmTitle')}</strong><span>{device.name}</span>
    </div>}
    footer={<Button type="primary" block size="large" disabled={!device.online} onClick={onConfirm}>
      {t('client.deviceScreen.turnOff')}
    </Button>}>
    <p className="device-screen-explanation">{t('client.deviceScreen.confirmMessage')}</p>
  </Drawer>;
}
