import { uiText } from "../../i18n/uiText";
import { remoteErrorText } from "../../../../../shared/localization/errors";
import { useRef, useState } from 'react';
import { Popover, Spin } from 'antd';
import { Check, ChevronDown, Monitor, RefreshCw } from 'lucide-react';
import type { GuiComputerNavigation } from './remote/types';
import styles from './ProxyAccountPicker.module.less';

function DeviceList({ navigation, busy, choose }: {
  navigation: GuiComputerNavigation; busy: boolean; choose: (device: GuiComputerNavigation['current']) => void;
}) {
  return <section className={styles.deviceList} aria-label={uiText("client.workspaceSettings.devices")} aria-busy={navigation.loading}>
    {navigation.allowLocal !== false && <button type="button" className={styles.deviceOption} disabled={busy}
      aria-pressed={!navigation.current} onClick={() => choose(null)}>
      <Monitor size={16} /><span>{uiText("client.composer.thisComputer")}</span>{!navigation.current && <Check size={16} />}
    </button>}
    {navigation.devices.map((device) => <button key={device.deviceId} type="button"
      className={styles.deviceOption} aria-pressed={navigation.current?.deviceId === device.deviceId}
      disabled={busy || !device.online} onClick={() => choose(device)}>
      <Monitor size={16} /><span><span className={styles.deviceName}>{device.name}</span>
        <small>{device.online ? uiText("client.chat.online") : uiText("client.chat.offline")} · {device.platform}</small></span>
      {navigation.current?.deviceId === device.deviceId && <Check size={16} />}
    </button>)}
  </section>;
}

export function GuiDevicePicker({ navigation, busy, onSelect }: {
  navigation: GuiComputerNavigation; busy: boolean; onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const choose = (device: GuiComputerNavigation['current']) => {
    if (busy) return;
    navigation.choose(device); setOpen(false); onSelect();
  };
  const content = <div className={styles.devicePanel} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
  }}>
    <DeviceList navigation={navigation} busy={busy} choose={choose} />
    <div className={styles.deviceFooter}>
      {!navigation.authenticated ? <button type="button" className={styles.deviceOption}
        disabled={busy} onClick={() => { close(); onSelect(); navigation.login(); }}>{uiText("client.workspaceSettings.signInToChooseAnotherDevice")}</button> : <>
        {!navigation.devices.length && !navigation.loading && !navigation.error
          && <p className={styles.hint}>{uiText("client.workspaceSettings.openInterludeOnAnotherDeviceAndSignInTo")}</p>}
        <button type="button" className={styles.deviceOption} aria-label={uiText("client.app.refreshDeviceList")}
          disabled={navigation.loading} onClick={navigation.refresh}>
          {navigation.loading ? <Spin size="small" /> : <RefreshCw size={14} />}{uiText("client.app.refreshDeviceList")}</button>
      </>}
      {navigation.error && <p className={styles.error} role="alert">{remoteErrorText(navigation.error)}</p>}
    </div>
  </div>;
  return <Popover trigger="click" placement="bottomRight" arrow={false} open={open} content={content}
    classNames={{ root: styles.devicePopup }} getPopupContainer={(element) => element.parentElement ?? document.body}
    onOpenChange={(next) => { setOpen(next); if (next) navigation.refresh(); }}>
    <button ref={trigger} type="button" className={styles.deviceTrigger} aria-label={uiText("client.workspaceSettings.switchDevice")}
      aria-expanded={open} title={uiText("client.workspaceSettings.currentDevice", { value1: navigation.current?.name ?? uiText("client.composer.thisComputer") })} onKeyDown={(event) => {
        if (open && event.key === 'Escape') { event.stopPropagation(); close(); }
      }}>
      <Monitor size={16} /><span>{uiText("client.workspaceSettings.switchDevice")}</span><ChevronDown size={12} />
    </button>
  </Popover>;
}
