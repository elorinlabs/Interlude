import { uiText } from "../../i18n/uiText";
import { type ReactNode, type RefObject } from 'react';
import { Popover, Spin } from 'antd';
import type { GuiComputerNavigation } from './remote/types';
import { GuiDevicePicker } from './GuiDevicePicker';
import { MAX_ACCOUNT_PICKER_WIDTH, useAccountPickerWidth } from './useAccountPickerWidth';
import styles from './ProxyAccountPicker.module.less';

interface Props {
  active: boolean; open: boolean; onOpenChange: (open: boolean) => void;
  trigger: RefObject<HTMLButtonElement>; name: string; summary: ReactNode;
  accounts: (devicePicker: ReactNode) => ReactNode;
  computers?: GuiComputerNavigation; busy?: boolean;
}

/** Local and remote accounts share one panel with an independent device dropdown. */
export function GuiAccountMenu(props: Props) {
  const width = useAccountPickerWidth(props.active);
  const visible = props.open && props.active;
  const close = () => { props.onOpenChange(false); props.trigger.current?.focus(); };
  const panel = <div className={styles.panel} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
  }}>
    {visible && props.accounts(props.computers && <GuiDevicePicker navigation={props.computers}
      busy={Boolean(props.busy)} onSelect={close} />)}
  </div>;
  return <Popover trigger="click" placement="topLeft" open={visible} content={panel} fresh
    arrow={false} align={{ offset: [0, -2] }} classNames={{ root: styles.popup }}
    styles={{ root: { width, maxWidth: MAX_ACCOUNT_PICKER_WIDTH } }} onOpenChange={props.onOpenChange}>
    <button ref={props.trigger} type="button" className={styles.trigger} aria-expanded={visible}
      aria-busy={Boolean(props.busy)}
      aria-label={uiText("client.workspaceSettings.switchGuiAccount", { value1: props.name })}>
      {props.busy && <Spin size="small" />}
      <span className={styles.triggerBody}>{props.summary}</span>
    </button>
  </Popover>;
}
