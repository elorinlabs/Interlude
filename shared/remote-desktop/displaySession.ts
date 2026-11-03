import { DesktopReceiver, type ReceiverOptions } from './receiver';
import type { DesktopSecurityChange } from './security';
import type { DesktopCapabilities, DesktopDisplays, DesktopResolution, DesktopSettings, DesktopStats } from './protocol';

export const BACKGROUND_DISPLAY_FPS = 1;

interface DisplaySession {
  receiver: DesktopReceiver;
  settings: DesktopSettings;
  displays: DesktopDisplays;
  capabilities: DesktopCapabilities;
  stream?: MediaStream;
  stats?: DesktopStats;
  status: string;
  audio: boolean;
  connected: boolean;
  failure?: string;
}

/** A viewer opens displays on demand and retains only screens it has actually visited. */
export class DesktopDisplaySession {
  private readonly sessions = new Set<DisplaySession>();
  private selected?: DisplaySession;
  private stopped = false;
  private muted = false;
  private switching = false;
  private closing?: Promise<void>;
  constructor(private readonly options: ReceiverOptions, private readonly privacyRestore = { failed: false }) {}

  get displayId() { return this.selected?.displays.displayId; }
  async security(change: DesktopSecurityChange) {
    if (this.stopped || !this.selected || this.switching) throw new Error('请等待桌面连接后重试。');
    const state = await this.selected.receiver.security(change);
    for (const entry of this.sessions) entry.displays.security = state;
    return state;
  }
  get clipboard() {
    if (!this.selected) throw new Error('请等待桌面连接后重试。');
    return this.selected.receiver.clipboard;
  }
  input(input: Parameters<DesktopReceiver['input']>[0]) { this.selected?.receiver.input(input); }
  async inputFocus() {
    const selected = this.selected;
    if (this.stopped || this.switching || !selected) return null;
    const focus = await selected.receiver.inputFocus();
    return !this.stopped && !this.switching && this.selected === selected ? focus : null;
  }
  frameRendered(stream: MediaStream | undefined) { this.selected?.receiver.frameRendered(stream); }
  mute(value: boolean) { this.muted = value; this.selected?.receiver.mute(value); }

  async start(settings: DesktopSettings) {
    if (this.stopped) return;
    const entry = this.create(settings);
    this.select(entry);
    await entry.receiver.start(settings);
    if (this.stopped || entry.receiver.closed || this.privacyRestore.failed || !entry.displays.security?.privacyScreen
      || entry.displays.privacyScreen || entry.capabilities.control !== true || !entry.capabilities.privacyScreen) return;
    try { await entry.receiver.privacy(true); }
    catch (error) {
      // A broken privacy driver must not cause repeated locking through automatic reconnects.
      this.privacyRestore.failed = true;
      if (!this.stopped) this.options.status(typeof error === 'string' ? error
        : error instanceof Error ? error.message : 'client.remoteDesktop.privacyFailed');
    }
  }

  private create(settings: DesktopSettings): DisplaySession {
    const visible = () => !this.stopped && this.selected === entry;
    const receiver = new DesktopReceiver({ ...this.options,
      stream: value => { entry.stream = value; if (visible()) this.options.stream(value); },
      status: value => { entry.status = value; if (visible()) this.options.status(value); },
      stats: value => { entry.stats = value; if (visible()) this.options.stats(value); },
      audio: value => { entry.audio = value; if (visible()) this.options.audio?.(value); },
      capabilities: value => { entry.capabilities = value; if (visible()) this.options.capabilities?.(value); },
      displays: value => {
        entry.displays = { ...entry.displays, ...value };
        entry.settings = { ...entry.settings, displayId: value.displayId };
        if (visible()) this.options.displays?.(value);
      },
      connected: () => { entry.connected = true; if (visible()) this.options.connected?.(); },
      failed: message => {
        entry.failure = message;
        if (visible() && !this.switching) this.options.failed?.(message);
        if (!visible()) { this.sessions.delete(entry); void entry.receiver.stop(); }
      },
    });
    const entry: DisplaySession = { settings, displays: {}, capabilities: {}, status: '正在连接桌面…',
      audio: false, connected: false, receiver };
    entry.receiver.mute(true);
    this.sessions.add(entry);
    return entry;
  }

  private select(entry: DisplaySession) {
    this.selected?.receiver.mute(true);
    this.selected = entry;
    entry.receiver.mute(this.muted);
    this.options.stream(entry.stream);
    this.options.status(entry.status);
    this.options.audio?.(entry.audio);
    this.options.capabilities?.(entry.capabilities);
    if (entry.displays.displayId) this.options.displays?.(entry.displays);
    this.options.stats(entry.stats ?? { width: 0, height: 0, fps: 0, bitrate: 0 });
    if (entry.connected && !entry.failure && !entry.receiver.closed) this.options.connected?.();
  }

  async settings(next: DesktopSettings) {
    const previous = this.selected;
    if (this.stopped || !previous) return;
    if (next.displayId === previous.displays.displayId) {
      await previous.receiver.settings(next); previous.settings = next; return;
    }
    this.switching = true;
    try { await this.switchDisplay(previous, next); }
    finally {
      this.switching = false;
      if (!this.stopped && this.selected?.failure) this.options.failed?.(this.selected.failure);
    }
  }

  private async switchDisplay(previous: DisplaySession, next: DesktopSettings) {
    this.options.status('正在切换显示器…');
    if (!previous.capabilities.displaySessions) {
      await previous.receiver.stop(); this.sessions.delete(previous);
      if (!this.stopped) await this.start(next);
      return;
    }
    let target: DisplaySession | undefined;
    try {
      await previous.receiver.settings({ ...previous.settings, fps: BACKGROUND_DISPLAY_FPS });
      if (this.stopped) return;
      target = [...this.sessions].find(entry =>
        entry.displays.displayId === next.displayId && !entry.failure && !entry.receiver.closed);
      if (target) {
        await target.receiver.settings(next); target.settings = next;
      } else {
        target = this.create(next);
        await target.receiver.start({ ...next, retainedSession: previous.receiver.sessionId });
      }
      if (this.stopped) return;
      if (target.failure || target.receiver.closed) throw new Error(target.failure ?? target.status);
      this.select(target);
    } catch (error) {
      if (target) { this.sessions.delete(target); await target.receiver.stop(); }
      if (!this.stopped) {
        await previous.receiver.settings(previous.settings);
        this.select(previous);
      }
      throw error;
    }
  }

  async privacy(enabled: boolean) {
    // Physical displays can disappear during privacy setup; release their captures before changing topology.
    await this.closeBackground();
    return this.selected?.receiver.privacy(enabled);
  }
  async resolution(size: DesktopResolution) {
    if (!this.selected || this.stopped) throw new Error('桌面连接已结束。');
    return this.selected.receiver.resolution(size);
  }
  private async closeBackground() {
    const background = [...this.sessions].filter(entry => entry !== this.selected);
    background.forEach(entry => this.sessions.delete(entry));
    await Promise.all(background.map(entry => entry.receiver.stop()));
  }
  stop() {
    this.stopped = true;
    this.closing ??= Promise.all([...this.sessions].map(entry => entry.receiver.stop())).then(() => {
      this.sessions.clear(); this.selected = undefined;
    });
    return this.closing;
  }
}
