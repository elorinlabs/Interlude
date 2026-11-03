import type { GuiAccountsClient } from '../../../../shared/remote-chat/guiAccounts';
import type { ChatComputer } from '../../../../shared/remote-chat/devices';
import type { ComputerListRefresh } from '../../../../shared/remote-chat/ComputerSearchBar';
import { RemoteAccountPicker } from '../../../desktop/src/pages/codexGui/remote/RemoteAccountPicker';
import { useLanguage } from '../i18n';
import './chatDesktopAccountPicker.css';

interface Props {
  client: GuiAccountsClient; ready: boolean; active: boolean;
  device?: ChatComputer; devices: ChatComputer[]; deviceRefresh?: ComputerListRefresh;
  chooseDevice: (id: string) => void; chooseLocal?: () => void;
}

export function ChatDesktopAccountPicker(props: Props) {
  useLanguage();
  return <div className="chat-desktop-account-picker">
    <RemoteAccountPicker client={props.client} ready={props.ready} active={props.active} privacyMode={false}
      computers={{ current: props.device ?? null, devices: props.devices,
        allowLocal: Boolean(props.chooseLocal), authenticated: true,
        loading: props.deviceRefresh?.loading ?? false, error: props.deviceRefresh?.error ?? '',
        refresh: () => props.deviceRefresh?.refresh(), login: () => {},
        choose: device => { if (device) props.chooseDevice(device.deviceId); else props.chooseLocal?.(); } }} />
  </div>;
}
