import { lazy, Suspense } from 'react';
import { Tooltip } from 'antd';
import { Monitor } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import type { DesktopClient } from '../../../../../shared/remote-desktop/protocol';
import { useDesktopLauncher } from '../../../../../shared/remote-desktop/useDesktopLauncher';
import { uiText } from "../../i18n/uiText";
import { localDesktopClipboard } from '../../remoteDesktop/localClipboard';
import styles from './GuiRemoteDesktop.module.less';

const RemoteDesktop = lazy(() => import('../../../../web/src/chat/desktop/RemoteDesktop')
  .then(module => ({ default: module.RemoteDesktop })));

export function GuiRemoteDesktop({ client, active, connected }: {
  client: DesktopClient; active: boolean; connected: boolean;
}) {
  const { opened, minimized, setMinimized, open, close } =
    useDesktopLauncher();
  const background = opened && minimized && active;
  const label = uiText(background ? "client.remoteDesktop.restoreRemoteDesktop" : "client.remoteDesktop.openRemoteDesktop");
  return <>
    <Tooltip title={label} styles={{ root: { maxWidth: 400 } }}>
      <button type="button" className={styles.launcher} disabled={!active || (!opened && !connected)}
        aria-label={label} aria-expanded={opened && !minimized} onClick={open}>
        <Monitor size={14} aria-hidden="true" /><span>{uiText("client.remoteDesktop.remoteDesktop")}</span>
        {background && connected && <span className={styles.status} role="status" aria-label={uiText("client.remoteDesktop.runningInTheBackground")} />}
      </button>
    </Tooltip>
    <Suspense fallback={null}>
      {opened && <RemoteDesktop client={client} active visible={active} connected={connected} close={close}
        windowState={{ minimized, setMinimized }} nativeWindow={isTauri()}
        localClipboard={isTauri() ? localDesktopClipboard : undefined} />}
    </Suspense>
  </>;
}
