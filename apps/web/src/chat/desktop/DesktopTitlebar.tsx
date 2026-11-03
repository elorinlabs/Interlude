import type { ComponentProps } from 'react';
import { Maximize, Minimize, Minus, X } from 'lucide-react';
import { DesktopDisplayBar } from './DesktopDisplayBar';
import type { useDesktopWindow } from './useDesktopWindow';
import { t } from '../../i18n';
import './titlebar.css';

interface Props extends ComponentProps<typeof DesktopDisplayBar> {
  controls: ReturnType<typeof useDesktopWindow>;
  close: () => void;
}

export function DesktopTitlebar({ controls, close, ...displays }: Props) {
  const drag = displays.nativeWindow && !controls.fullscreen || undefined;
  return <header className="rd-titlebar" data-tauri-drag-region={drag}>
    <DesktopDisplayBar {...displays} nativeWindow={drag} />
    <div className="rd-titlebar-space" data-tauri-drag-region={drag} />
    <div className="rd-window-controls" role="group" aria-label={t("client.remoteDesktop.remoteDesktopWindowControls")}>
      <button type="button" aria-label={t("client.remoteDesktop.minimize")} disabled={controls.busy}
        onClick={() => { void controls.minimize(); }}><Minus size={18} /></button>
      <button type="button" aria-label={t(controls.fullscreen ? "client.remoteDesktop.exitFullscreen" : "client.runtimeErrors.fullscreen")}
        aria-pressed={controls.fullscreen} disabled={controls.busy || !document.fullscreenEnabled}
        onClick={() => { void controls.toggleFullscreen(); }}>
        {controls.fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
      </button>
      <button type="button" className="rd-window-close" aria-label={t("client.projectBrowser.close")} onClick={close}>
        <X size={19} />
      </button>
    </div>
  </header>;
}
