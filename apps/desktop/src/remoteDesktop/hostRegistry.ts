import { object, type IceServer } from '../../../../shared/remote-chat/protocol';
import { validateResolution, validateSettings, type DesktopDisplays, type DesktopInputFocus,
  type DesktopOffer, type DesktopResolution,
  type DesktopSettings, type DesktopSignal, type DesktopSignalReply }
  from '../../../../shared/remote-desktop/protocol';
import type { ConnectionDiagnostic } from '../../../../shared/remote-chat/diagnostics';
import type { NativeMediaFactory } from '../../../../shared/remote-desktop/nativeMedia';
import { desktopOccupied } from '../../../../shared/remote-desktop/takeover';
import { NativeMediaHostSession } from './nativeMediaSession';
import { desktopPermissionStatus } from './permissions';
import type { DesktopCaptureSettings } from './displays';
import { validateDesktopSecurity, type DesktopSecurity, type DesktopSecurityChange }
  from '../../../../shared/remote-desktop/security';

export interface DesktopHostSession {
  security?(change: DesktopSecurityChange): Promise<DesktopSecurity>;
  inputFocus?(): Promise<DesktopInputFocus | null>;
  readonly closed: boolean;
  open(): Promise<DesktopOffer>;
  close(): unknown;
  signal(signal: DesktopSignal): Promise<DesktopSignalReply>;
  update(settings: DesktopSettings): Promise<void>;
  privacy?(enabled: boolean): Promise<DesktopDisplays>;
  resolution?(resolution: DesktopResolution): Promise<DesktopDisplays>;
  renew?(expiresAt: number): Promise<void>;
}
interface ActiveDisplay {
  owner: string; id: string; group: string; displayId?: string;
  session: DesktopHostSession; displaySessions?: boolean;
  opening?: Promise<DesktopOffer>;
}

export type DesktopHostSessionFactory = (settings: DesktopCaptureSettings, ice: IceServer[], expiresAt?: number,
  diagnostic?: ConnectionDiagnostic) => DesktopHostSession;

/** Owner and ICE configuration come only from the authenticated coordinator. */
export class RemoteDesktopHostRegistry {
  constructor(private readonly createSession: DesktopHostSessionFactory) {}
  private peers = new Map<string, {
    ice: IceServer[]; expiresAt?: number; diagnostic?: ConnectionDiagnostic; media?: NativeMediaFactory;
  }>();
  private active = new Map<string, ActiveDisplay>();
  register(owner: string, iceServers: IceServer[], expiresAt?: number) {
    const expiry = typeof expiresAt === 'number' && Number.isFinite(expiresAt) ? expiresAt : this.peers.get(owner)?.expiresAt;
    this.peers.set(owner, { ...this.peers.get(owner), ice: iceServers, expiresAt: expiry });
    for (const active of this.active.values()) {
      if (active.owner === owner && expiry) {
        void active.session.renew?.(expiry).catch(() => active.session.close());
      }
    }
  }
  diagnose(owner: string, diagnostic: ConnectionDiagnostic) {
    const peer = this.peers.get(owner);
    if (peer) peer.diagnostic = (event, fields) => diagnostic(event, { ...fields, scope: 'desktop' });
  }
  nativeMedia(owner: string, media: NativeMediaFactory) {
    const peer = this.peers.get(owner);
    if (peer) peer.media = media;
  }
  async request(value: unknown, owner: string) {
    const body = object(value);
    const peer = this.peers.get(owner);
    if (!peer) throw new Error('请先连接电脑。');
    if (body.action === 'permissions') {
      if (peer.expiresAt !== undefined && peer.expiresAt <= Date.now()) throw new Error('桌面连接已结束。');
      return desktopPermissionStatus();
    }
    if (typeof body.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(body.id)) {
      throw new Error('桌面连接信息无效，请重新连接。');
    }
    if (body.action === 'open') {
      if (peer.expiresAt !== undefined && peer.expiresAt <= Date.now()) throw new Error('桌面连接已结束。');
      return this.open({ owner, id: body.id, settings: body.settings, iceServers: peer.ice,
        takeover: body.takeover, takeoverSupported: body.takeoverSupported === true });
    }
    const active = this.active.get(body.id);
    if (!active || active.owner !== owner) {
      if (body.action === 'close') return;
      throw new Error('桌面连接已结束，请重新连接。');
    }
    switch (body.action) {
      case 'security':
        if (!active.session.security) throw new Error('这台电脑暂不支持此安全选项。');
        return active.session.security(validateDesktopSecurity(body.change));
      case 'inputFocus': return await active.session.inputFocus?.() ?? null;
      case 'resolution':
        if (!active.session.resolution) throw new Error('这台电脑暂不支持切换分辨率。');
        return active.session.resolution(validateResolution(body.resolution));
      case 'privacy':
        if (typeof body.enabled !== 'boolean') throw new Error('远程操作无效，请重试。');
        if (!active.session.privacy) throw new Error('这台电脑暂不支持隐私屏。');
        await this.closeOthers(active);
        return active.session.privacy(body.enabled);
      case 'close':
        await active.session.close();
        if (this.active.get(body.id) === active) this.active.delete(body.id);
        return;
      case 'settings': await active.session.update(validateSettings(body.settings)); return;
      case 'signal': return active.session.signal(body as unknown as DesktopSignal);
      default: throw new Error('不支持的远程桌面操作。');
    }
  }
  private async open(input: {
    owner: string; id: string; settings: unknown; iceServers: IceServer[];
    takeover?: unknown; takeoverSupported: boolean;
  }) {
    const settings = validateSettings(input.settings);
    const live = [...this.active.values()].filter(entry => !entry.session.closed);
    const replacing = live.length > 0 && !settings.retainedSession;
    if (replacing && (input.takeover !== live[0].group || live.some(entry => entry.group !== input.takeover))) {
      throw new Error(input.takeoverSupported ? desktopOccupied(live[0].group) : '已有远程桌面连接，请先关闭后再试。');
    }
    const group = replacing ? crypto.randomUUID() : this.captureGroup(input, settings);
    const expired = [...this.active.values()].filter(entry => entry.session.closed);
    const previous = replacing ? [...this.active.values()] : expired;
    previous.forEach(entry => this.active.delete(entry.id));
    const peer = this.peers.get(input.owner);
    const session = new NativeMediaHostSession({ id: input.id, settings, iceServers: input.iceServers,
      media: peer?.media, diagnostic: peer?.diagnostic,
      create: ice => this.createSession({ ...settings, captureGroup: group }, ice, peer?.expiresAt, peer?.diagnostic) });
    const active: ActiveDisplay = { owner: input.owner, id: input.id, group, displayId: settings.displayId, session };
    // Reserve the replacement before yielding so concurrent confirmations cannot replace the same connection twice.
    this.active.set(input.id, active);
    active.opening = this.start(active, previous);
    return active.opening;
  }
  private async start(active: ActiveDisplay, previous: ActiveDisplay[]) {
    const { session, owner, id } = active;
    try {
      if (previous.length) await Promise.all(previous.map(async entry => {
        await entry.session.close();
        // A cancelled open can still be releasing native capture resources.
        await entry.opening?.catch(() => undefined);
      }));
      const peer = this.peers.get(owner);
      if (session.closed || !peer || (peer.expiresAt !== undefined && peer.expiresAt <= Date.now())) {
        throw new Error('桌面连接已结束。');
      }
      const offer = await session.open();
      active.displayId = offer.displayId; active.displaySessions = offer.capabilities?.displaySessions;
      return offer;
    }
    catch (error) {
      await session.close();
      if (this.active.get(id) === active) this.active.delete(id);
      if (typeof error === 'string') throw new Error(error);
      throw error;
    }
  }
  private captureGroup(input: { owner: string; id: string }, settings: DesktopSettings) {
    const live = [...this.active.values()].filter(entry => !entry.session.closed);
    if (!live.length && !settings.retainedSession) return crypto.randomUUID();
    const parent = this.active.get(settings.retainedSession ?? '');
    if (!parent || parent.owner !== input.owner || parent.session.closed || !parent.displaySessions
      || !settings.displayId || live.some(entry => entry.owner !== input.owner || entry.id === input.id
        || entry.displayId === settings.displayId)) {
      throw new Error('已有远程桌面连接，请先关闭后再试。');
    }
    return parent.group;
  }
  private async closeOthers(selected: ActiveDisplay) {
    const others = [...this.active.values()].filter(entry => entry !== selected);
    await Promise.all(others.map(async entry => {
      await entry.session.close();
      if (this.active.get(entry.id) === entry) this.active.delete(entry.id);
    }));
  }
  release(owner?: string) {
    if (owner === undefined) this.peers.clear(); else this.peers.delete(owner);
    for (const active of this.active.values()) {
      if (owner === undefined || active.owner === owner) {
        active.session.close(); this.active.delete(active.id);
      }
    }
  }
}
