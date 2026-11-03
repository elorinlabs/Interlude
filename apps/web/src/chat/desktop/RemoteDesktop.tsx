import { displayText, displayError } from '../../i18n/index';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clipboard, Grid2X2, Hand, Keyboard, Maximize, Monitor, Mouse, Settings2, Shield, Volume2, VolumeX, X } from 'lucide-react';
import type { DesktopClient } from '../../../../../shared/remote-desktop/protocol';
import type { LocalDesktopClipboard } from '../../../../../shared/remote-desktop/clipboard';
import { useDesktopSession } from '../../../../../shared/remote-desktop/useDesktopSession';
import { DisplaySettings } from './DisplaySettings';
import { SecuritySettings } from './SecuritySettings';
import { desktopSecuritySettings } from '../../../../../shared/remote-desktop/securitySettings';
import { DesktopTitlebar } from './DesktopTitlebar';
import { useDesktopWindow, type DesktopWindowState } from './useDesktopWindow';
import { DesktopStats } from './DesktopStats';
import { DesktopMouse } from './MousePad';
import { useTrackpad } from './useTrackpad';
import { useVideoViewport } from './useVideoViewport';
import { useMousePanel } from '../../../../../shared/remote-desktop/useMousePanel';
import { useMouseViewport } from '../../../../../shared/remote-desktop/useMouseViewport';
import { useDesktopZoom } from '../../../../../shared/remote-desktop/useDesktopZoom';
import { desktopStatusAction } from '../../../../../shared/remote-desktop/statusAction';
import { useInputViewport } from '../../../../../shared/remote-desktop/useInputViewport';
import { useDesktopInputFocus } from '../../../../../shared/remote-desktop/useDesktopInputFocus';
import { MOUSE_PANEL_SIZE, MOUSE_ICON_SIZE } from '../../../../../shared/remote-desktop/geometry';
import { t } from '../../i18n';
import { usePageVisibility } from './usePageVisibility';
import { useKeyboardViewport } from './useKeyboardViewport';
import { useDesktopPlayback } from './useDesktopPlayback';
import { useHardwarePointer } from './useDesktopMouse';
import { useDesktopClipboard } from './useDesktopClipboard';
import { DesktopClipboardPanel } from './DesktopClipboardPanel';
import { DesktopClipboardNotice } from './DesktopClipboardNotice';
import { DesktopInputSurface } from './DesktopInputSurface';
import { DesktopKeyboard } from './DesktopKeyboard';
import { useDesktopOrientation } from './useDesktopOrientation';
import { DesktopErrorBoundary } from './DesktopErrorBoundary';
import { DesktopTakeover } from './DesktopTakeover';
import './desktop.css';

const createPeer = (configuration: RTCConfiguration) => new RTCPeerConnection(configuration);

interface Props {
  client: DesktopClient; active: boolean; close: () => void; localClipboard?: LocalDesktopClipboard;
  /** Hide a retained computer's viewer without ending its media session or resetting its window. */
  visible?: boolean;
  connected?: boolean;
  nativeWindow?: boolean;
  windowState?: DesktopWindowState;
}

export function RemoteDesktop(props: Props) {
  return <DesktopErrorBoundary active={props.active && props.visible !== false} close={props.close}>
    <DesktopViewer {...props} />
  </DesktopErrorBoundary>;
}

function DesktopViewer({ client, active, visible = true, connected = true, close, localClipboard, nativeWindow = false,
  windowState }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const windowControls = useDesktopWindow(root, active, windowState);
  const shown = active && visible && !windowControls.minimized;
  const pageVisible = usePageVisibility();
  const session = useDesktopSession({ client, active: active && pageVisible, connected, createPeer });
  const statusAction = desktopStatusAction(session);
  const viewOnly = session.capabilities.control === false;
  const [display, setDisplay] = useState(false);
  const [security, setSecurity] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const keyboardViewport = useKeyboardViewport(shown && (keyboard || display || security));
  const [direct, setDirect] = useState(false);
  const [statsVisible, setStatsVisible] = useState(true);
  const hardware = useHardwarePointer();
  const desktopWindow = nativeWindow || hardware;
  const clipboard = useDesktopClipboard({ active: shown && !!session.stream,
    connected: active && !!session.stream,
    clipboard: session.clipboard, localClipboard });
  const panelVisible = !viewOnly && !hardware && !direct && !display && !security && !keyboard && !clipboard.open;
  const panel = useMousePanel(shown && panelVisible && !!session.stream);
  const video = useRef<HTMLVideoElement>(null);
  const playback = useDesktopPlayback(video, session.stream, session.muted);
  const silent = session.muted || playback.blocked;
  const audioUnavailable = !session.hasAudio || session.stats?.audio === 'unavailable';
  const toggleAudio = () => {
    if (silent) { session.mute(false); playback.enable(); } else session.mute(true);
  };
  useDesktopOrientation(root, shown && !desktopWindow);
  const stage = useRef<HTMLDivElement>(null);
  const measured = useVideoViewport(stage, video, shown);
  const fitted = useInputViewport(measured, keyboard);
  const zoom = useDesktopZoom(fitted, shown && !!session.stream);
  const inputFocus = useDesktopInputFocus({ active: shown && keyboard && !hardware && !!session.stream,
    read: session.inputFocus, displayId: session.settings.displayId });
  const viewport = useMouseViewport(session.pointer, zoom.viewport,
    panelVisible ? (panel.expanded ? MOUSE_PANEL_SIZE : MOUSE_ICON_SIZE) : undefined,
    { manual: zoom.modified, inputOpen: keyboard && !hardware, inputFocus });
  const trackpad = useTrackpad({ pointer: session.pointer, viewport, direct, panel, id: 'stage', zoom: zoom.gestures });
  const wheel = (delta: number, horizontal = false) => {
    session.pointer.synchronize(); session.input({ kind: 'wheel', delta, ...(horizontal ? { horizontal } : {}) });
  };
  const switchMode = (next: boolean) => { session.pointer.release(); setDirect(next); if (!next) panel.expand(); };
  useEffect(() => {
    if (!shown) return;
    const previous = document.activeElement as HTMLElement | null;
    const target = hardware ? root.current?.querySelector<HTMLTextAreaElement>('.rd-key-capture') : root.current;
    target?.focus({ preventScroll: true });
    return () => { session.pointer.release(); previous?.focus(); };
  }, [shown, hardware, session.pointer]);
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  const frameRendered = () => {
    if ((video.current?.videoWidth ?? 0) > 0) session.frameRendered();
  };
  if (!active) return null;
  return createPortal(<><div ref={root} tabIndex={-1} className="rd-root" style={keyboardViewport}
    hidden={!shown}
    role="dialog" aria-modal="true"
    aria-label={t("client.remoteDesktop.remoteDesktop")} onContextMenu={event => event.preventDefault()}>
    {desktopWindow && <DesktopTitlebar displays={session.displays} selected={session.settings.displayId}
      nativeWindow={nativeWindow} controls={windowControls} close={close}
      disabled={session.saving || !session.stream}
      select={displayId => { void session.update({ ...session.settings, displayId }); }} />}
    <div className="rd-workspace">
    <div ref={stage} className="rd-stage">
      <video ref={video} autoPlay playsInline onLoadedData={frameRendered} onResize={frameRendered}
        className="rd-video" style={{
        left: viewport.content.x, top: viewport.content.y,
        width: viewport.content.width, height: viewport.content.height }} />
      <DesktopInputSurface key={direct ? 'direct' : 'trackpad'} pointer={session.pointer} viewport={viewport}
        input={session.input} trackpad={trackpad} hardware={hardware} active={!!session.stream && shown}
        clipboard={clipboard} wheel={wheel} />
      {session.stream && session.stats && statsVisible && !keyboard
        && <DesktopStats stats={session.stats} close={() => setStatsVisible(false)} />}
      {session.stream && !hardware && <DesktopMouse pointer={session.pointer} viewport={viewport} panel={panel}
        visible={panelVisible} wheel={wheel}
        horizontal={!!session.capabilities.horizontalScroll} />}
      {session.status && !security && !session.takeover.pending
        && <div className={`rd-status${session.stream ? '' : ' rd-status-empty'}`} role="status">
        <span>{displayError(session.status)}</span>
        <button disabled={!connected || session.saving} onClick={statusAction.run}>
          {displayText(statusAction.label)}</button></div>}
      {windowControls.error && <div className="rd-clipboard-notice" role="alert">{displayError(windowControls.error)}</div>}
      {display && <DisplaySettings settings={session.settings} displays={session.displays} update={session.update}
        resolution={session.resolution}
        saving={session.saving || !session.stream}
        stats={{ visible: statsVisible, toggle: () => setStatsVisible(!statsVisible) }}
        close={() => setDisplay(false)} />}
      {clipboard.open && <DesktopClipboardPanel clipboard={clipboard} />}
      {security && <SecuritySettings {...desktopSecuritySettings(session, () => setSecurity(false))} />}
      <DesktopClipboardNotice clipboard={clipboard} />
      {shown && session.takeover.pending && <DesktopTakeover {...session.takeover} disabled={!connected} />}
      {viewOnly && session.stream && <div className="rd-clipboard-notice" role="status">{t("client.remoteDesktop.viewOnly")}</div>}
      {!viewOnly && hardware && session.stream && !session.capabilities.keyboard && !clipboard.status
        && <div className="rd-clipboard-notice" role="status">
          {t("client.remoteDesktop.updateTheAppOnTheRemoteComputerToEnablePhysical")}</div>}
    </div>
    <nav className="rd-toolbar" aria-label={t("client.remoteDesktop.remoteDesktopControls")}>
      {!hardware && <button disabled={viewOnly} aria-label={t(direct ? "client.remoteDesktop.switchToMouseMode" : "client.remoteDesktop.switchToTouchMode")} className="rd-mode"
        onClick={() => switchMode(!direct)}>{direct ? <Hand /> : <Mouse />}<span>{t(direct ? "client.remoteDesktop.touch" : "client.remoteDesktop.mouse")}</span></button>}
      <button disabled={viewOnly} aria-pressed={keyboard} onClick={() => {
        setKeyboard(!keyboard); setDisplay(false); setSecurity(false); clipboard.setOpen(false);
      }}>
        <Keyboard /><span>{t("client.remoteDesktop.keyboard")}</span></button>
      <button aria-pressed={clipboard.open} disabled={!session.security.clipboardSync} onClick={() => {
        clipboard.setOpen(!clipboard.open); setKeyboard(false); setDisplay(false); setSecurity(false);
      }}><Clipboard /><span>{t("client.remoteDesktop.clipboard")}</span></button>
      <button aria-label={t(audioUnavailable ? "client.remoteDesktop.soundUnavailable" : silent ? "client.remoteDesktop.enableSound" : "client.remoteDesktop.mute")}
        aria-pressed={!silent && !audioUnavailable} disabled={audioUnavailable} onClick={toggleAudio}>
        {silent || audioUnavailable ? <VolumeX /> : <Volume2 />}<span>{t(silent ? "client.remoteDesktop.enableSound" : "client.remoteDesktop.sound")}</span></button>
      <button disabled={viewOnly} onClick={() => session.input({ kind: 'key', key: 'desktop' })}>
        <Monitor /><span>{t("client.remoteDesktop.showDesktop")}</span></button>
      <button disabled={viewOnly} onClick={() => session.input({ kind: 'key', key: 'windows' })}>
        <Grid2X2 /><span>{t("client.remoteDesktop.allWindows")}</span></button>
      {session.capabilities.privacyScreen && <button aria-pressed={session.privacyScreen}
        aria-label={t(session.privacyScreen ? 'client.deviceScreen.restore' : 'client.deviceScreen.turnOff')}
        disabled={viewOnly || session.saving || !session.stream} onClick={() => void session.togglePrivacy()}>
        <Monitor /><span>{t(session.privacyScreen ? 'client.deviceScreen.restoreShort' : 'client.deviceScreen.turnOffShort')}</span>
      </button>}
      <button aria-pressed={security} onClick={() => {
        setSecurity(!security); setDisplay(false); setKeyboard(false); clipboard.setOpen(false);
      }}><Shield /><span>{t("client.remoteDesktop.security")}</span></button>
      <button aria-pressed={display} onClick={() => {
        setDisplay(!display); setKeyboard(false); setSecurity(false); clipboard.setOpen(false);
      }}>
        <Settings2 /><span>{t("client.remoteDesktop.display")}</span></button>
      {!desktopWindow && document.fullscreenEnabled
        && <button onClick={fullscreen}><Maximize /><span>{t("client.runtimeErrors.fullscreen")}</span></button>}
      {!desktopWindow && <button onClick={close}><X /><span>{t("client.projectBrowser.close")}</span></button>}
    </nav>
    </div>
    {keyboard && <DesktopKeyboard input={session.input} close={() => setKeyboard(false)}
      platform={session.capabilities.platform} mobile={!hardware}
      supported={!!session.capabilities.keyboard} />}
  </div>
    {visible && windowControls.minimized && !windowState && <button type="button" className="rd-restore"
      aria-label={t("client.remoteDesktop.restoreRemoteDesktop")} onClick={windowControls.restore}>
      <Monitor size={22} /><span>{t("client.remoteDesktop.remoteDesktop")}</span>
    </button>}
  </>, document.body);
}
