import { uiText } from "../../i18n/uiText";
import { remoteErrorText } from "../../../../../shared/localization/errors";
import { useEffect, useRef, useState } from 'react';
import { Popover, type InputRef } from 'antd';
import { Check, ChevronDown, Laptop, Monitor } from 'lucide-react';
import { ComputerSearchBar } from '../../../../../shared/remote-chat/ComputerSearchBar';
import type { GuiComputerNavigation } from './remote/types';
import projectStyles from './ProjectPicker.module.less';
import styles from './GuiHostPicker.module.less';

export function GuiHostPicker({ navigation, active }: { navigation: GuiComputerNavigation; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<InputRef>(null);
  const list = useRef<HTMLDivElement>(null);
  const currentId = navigation.current?.deviceId;
  const allowLocal = navigation.allowLocal !== false;
  const label = navigation.current?.name ?? uiText(allowLocal ? "client.git.local" : "client.settings.chooseAComputer");
  const keyword = query.trim().toLocaleLowerCase();
  const devices = navigation.devices.filter(device => device.name.toLocaleLowerCase().includes(keyword));
  const showLocal = allowLocal && uiText("client.git.local").includes(keyword);
  useEffect(() => { setOpen(false); }, [active, currentId]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const choose = (device: GuiComputerNavigation['current']) => {
    if (!active || (device && !device.online)) return;
    close(); navigation.choose(device);
  };
  const panel = <div className={projectStyles.panel} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const options = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = current < 0 && event.key === 'ArrowUp' ? options.length - 1
      : current + (event.key === 'ArrowDown' ? 1 : -1);
    event.preventDefault();
    if (next < 0 || next >= options.length) search.current?.focus();
    else options[next]?.focus();
  }}>
    <div ref={list} className={`${projectStyles.list} ${styles.list}`} role="menu"
      aria-label={uiText("client.workspaceSettings.computers")} aria-busy={navigation.loading}>
      {showLocal && <button type="button" role="menuitemradio" aria-checked={!currentId}
        className={projectStyles.option} onClick={() => choose(null)}>
        <Laptop size={18} /><span className={styles.deviceName}>{uiText("client.git.local")}</span>{!currentId && <Check size={16} />}
      </button>}
      {devices.map(device => <button key={device.deviceId} type="button" role="menuitemradio"
        aria-checked={currentId === device.deviceId} disabled={!device.online}
        aria-description={uiText(device.online ? "client.chat.online" : "client.chat.offline")}
        className={projectStyles.option} onClick={() => choose(device)}>
        <Monitor size={18} className={device.online ? styles.online : undefined} />
        <span className={styles.deviceName}>{device.name}</span>
        {currentId === device.deviceId && <Check size={16} />}
      </button>)}
      {!showLocal && !devices.length && <p className={projectStyles.empty}>{uiText("client.workspaceSettings.noMatchingComputers")}</p>}
    </div>
    {!navigation.authenticated ? <button type="button" className={projectStyles.option}
      onClick={() => { close(); navigation.login(); }}>{uiText("client.workspaceSettings.signInToChooseAnotherComputer")}</button> : <>
      {!navigation.devices.length && !navigation.loading && !navigation.error
        && <p className={projectStyles.empty}>{uiText("client.workspaceSettings.openInterludeOnAnotherComputerAndSignInTo")}</p>}
    </>}
    {navigation.error && <p className={`${projectStyles.empty} ${styles.error}`} role="alert">{remoteErrorText(navigation.error)}</p>}
    <ComputerSearchBar inputRef={search} query={query} onQueryChange={setQuery}
      searchLabel={uiText("client.workspaceSettings.searchComputers")} refreshLabel={uiText("client.workspaceSettings.refreshComputerList")}
      refresh={navigation.authenticated ? navigation : undefined} />

  </div>;
  return <Popover trigger="click" placement="topRight" arrow={false} open={open && active} content={panel}
    onOpenChange={next => { setOpen(next); if (next) { setQuery(''); navigation.refresh(); } }}
    afterOpenChange={next => { if (next) search.current?.focus(); }}
    styles={{ root: { maxWidth: 400 }, body: { padding: 0, borderRadius: 20, overflow: 'hidden' } }}>
    <button ref={trigger} type="button" className={`${projectStyles.name} ${styles.trigger}`}
      aria-label={uiText("client.workspaceSettings.switchComputer", { value1: label })} aria-haspopup="menu" aria-expanded={open && active}>
      {currentId || !allowLocal
        ? <Monitor size={16} className={navigation.current?.online ? styles.online : undefined} />
        : <Laptop size={16} />}
      <span>{label}</span><ChevronDown size={13} />
    </button>
  </Popover>;
}
