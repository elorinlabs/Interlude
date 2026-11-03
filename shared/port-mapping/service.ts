import type { GuiToolsClient } from '../remote-chat/guiTools';
import type { MappingTunnel, TunnelFactory } from './types';
import { MAX_PORT_MAPPINGS, MAPPING_PROTOCOLS, mappingConflicts, validPort,
  type MappingMode, type MappingProtocol, type PortMapping } from './settings';
import { mappingOrigin, normalizeMappingHost } from './target';
import { StreamBudget } from './streamBudget';
import { MAPPING_RECONNECT_REQUIRED, MAPPING_UPDATE_REQUIRED } from './errors';

export type ForwardingClient = Pick<GuiToolsClient['files'], 'openResource' | 'closeResource' | 'link'> & {
  stream?: import('./socket').MappingSocketFactory;
};
export interface ForwardingEntry extends PortMapping {
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  error?: string;
}
interface RunningMapping { tunnels: MappingTunnel; resource?: string }
const START_ERROR = '映射未能启动，请确认远程服务已启动后重试。';
const LOCAL_ERRORS = new Set(['本地端口已被占用，请换一个端口。', '无法监听本地端口，请换一个端口重试。',
  '请更新应用后使用端口映射。', '请返回应用后重新启动映射。',
  'UDP 映射未能启动，请确认两端应用均已更新。', MAPPING_UPDATE_REQUIRED, MAPPING_RECONNECT_REQUIRED]);
type MappingTarget = Pick<PortMapping, 'remoteHost' | 'remotePort' | 'localPort' | 'protocol'>;

/** One manager per authenticated computer; switching chat threads never releases its mappings. */
export class PortForwardingService {
  private connected = false;
  private entries: ForwardingEntry[];
  private readonly listeners = new Set<() => void>();
  private readonly running = new Map<string, RunningMapping>();
  private readonly stopping = new Map<string, Promise<void>>();
  private readonly changes = new Set<(id: string, value: PortMapping | null) => void>();
  private readonly revisions = new Map<string, number>();
  private readonly restarting = new Set<string>();
  // Bound active TCP work per computer so mappings leave capacity for chat and cleanup.
  private readonly bridgeBudget = new StreamBudget();

  constructor(private readonly client: ForwardingClient, saved: PortMapping[],
    private readonly platform: { createTunnel: TunnelFactory; createId: () => string; mode?: MappingMode }) {
    this.entries = saved.map(entry => ({ ...entry, status: 'stopped' }));
  }

  snapshot = () => this.entries;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  subscribeChanges = (listener: (id: string, value: PortMapping | null) => void) => {
    this.changes.add(listener);
    return () => { this.changes.delete(listener); };
  };

  setConnected = (connected: boolean) => {
    this.connected = connected;
    if (!connected) {
      this.restarting.clear();
      for (const id of this.running.keys()) void this.stop(id);
    }
  };

  add = (remotePort: number, localPort: number, remoteHost = '', protocol?: MappingProtocol) => {
    const target = this.validate({ remoteHost, remotePort, localPort,
      ...(protocol === undefined ? {} : { protocol }) });
    if (this.entries.length >= MAX_PORT_MAPPINGS) throw new Error('最多添加 8 条映射，请先删除一条。');
    const entry: ForwardingEntry = { id: this.platform.createId(), ...target, updatedAt: Date.now(), status: 'stopped' };
    this.publish([...this.entries, entry]);
    this.changed(entry.id, entry);
    void this.start(entry.id);
  };

  edit = async (id: string, target: MappingTarget) => {
    const previous = this.entries.find(entry => entry.id === id);
    if (!previous) throw new Error('该映射已被删除，请重新添加。');
    const entry = { id, ...this.validate(target, id), updatedAt: Date.now() };
    const applied = this.replace(entry);
    this.changed(id, entry);
    await applied;
  };

  /** Cloud configuration never imports another device's listener state. */
  applySaved = (saved: PortMapping[]) => {
    for (const entry of this.entries) {
      if (!saved.some(value => value.id === entry.id)) this.erase(entry.id);
    }
    for (const entry of saved) {
      const previous = this.entries.find(value => value.id === entry.id);
      if (previous && sameTarget(previous, entry) && previous.updatedAt === entry.updatedAt) continue;
      void this.replace(entry);
    }
  };

  private validate(target: MappingTarget, id?: string) {
    if (!MAPPING_PROTOCOLS.includes(target.protocol ?? 'tcp')) throw new Error('请选择 TCP、UDP 或全部。');
    if (!validPort(target.remotePort) || !validPort(target.localPort)) {
      throw new Error('请输入 1–65535 之间的端口号。');
    }
    const normalized = { ...target, remoteHost: normalizeMappingHost(target.remoteHost) };
    if (this.entries.some(entry => entry.id !== id && mappingConflicts(entry, normalized, this.platform.mode))) {
      throw new Error(this.platform.mode === 'preview' ? '这个目标地址已有映射。' : '这个本地端口已有映射。');
    }
    return normalized;
  }

  private async replace(config: PortMapping) {
    const previous = this.entries.find(entry => entry.id === config.id);
    const restart = this.restarting.has(config.id) || !!previous && ['running', 'starting'].includes(previous.status);
    const revision = (this.revisions.get(config.id) ?? 0) + 1;
    this.revisions.set(config.id, revision);
    const stopped = this.stop(config.id);
    if (restart) this.restarting.add(config.id);
    const entry: ForwardingEntry = { ...config, status: previous ? 'stopping' : 'stopped' };
    this.publish(previous ? this.entries.map(value => value.id === config.id ? entry : value) : [...this.entries, entry]);
    await stopped;
    if (this.revisions.get(config.id) !== revision) return;
    this.update(config.id, { status: 'stopped', error: undefined });
    if (this.restarting.delete(config.id)) await this.start(config.id);
  }

  start = async (id: string) => {
    const entry = this.entries.find(value => value.id === id);
    if (!entry || !this.connected || this.running.has(id) || this.stopping.has(id) || entry.status === 'stopping') return;
    const job: RunningMapping = { tunnels: this.platform.createTunnel(this.client, {
      mappingId: entry.id, localPort: entry.localPort, bridgeBudget: this.bridgeBudget,
      protocol: entry.protocol,
      onClosed: () => { void this.fail(id, job, '映射已中断，请重新启动。'); },
    }) };
    this.running.set(id, job);
    this.update(id, { status: 'starting', error: undefined });
    try {
      // The resource URL identifies the authorized destination for both TCP streams and UDP datagrams.
      const url = mappingOrigin(entry);
      job.resource = await this.client.openResource(url);
      if (this.running.get(id) !== job) { await this.release(job); return; }
      await job.tunnels.resolve(job.resource, url);
      if (this.running.get(id) !== job) { await this.release(job); return; }
      this.update(id, { status: 'running' });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      await this.fail(id, job, LOCAL_ERRORS.has(message) ? message : START_ERROR);
    }
  };

  stop = async (id: string) => {
    this.restarting.delete(id);
    const pending = this.stopping.get(id);
    if (pending) return pending;
    const job = this.running.get(id);
    if (!job) return;
    this.running.delete(id);
    this.update(id, { status: 'stopping', error: undefined });
    const stopped = this.release(job).finally(() => {
      this.stopping.delete(id);
      this.update(id, { status: 'stopped' });
    });
    this.stopping.set(id, stopped);
    await stopped;
  };

  remove = async (id: string) => {
    const stopped = this.erase(id);
    this.changed(id, null);
    await stopped;
  };

  private erase(id: string) {
    this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
    const stopped = this.stop(id);
    this.publish(this.entries.filter(entry => entry.id !== id));
    return stopped;
  }

  private changed(id: string, value: PortMapping | null) {
    for (const listener of this.changes) listener(id, value);
  }

  dispose = () => { this.setConnected(false); };

  private async fail(id: string, job: RunningMapping, error: string) {
    if (this.running.get(id) !== job) { await this.release(job); return; }
    const revision = this.revisions.get(id);
    await this.stop(id);
    if (this.revisions.get(id) === revision && !this.running.has(id)) this.update(id, { status: 'error', error });
  }

  private async release(job: RunningMapping) {
    const resource = job.resource;
    job.resource = undefined;
    await job.tunnels.close();
    if (resource) await this.client.closeResource(resource)
      .catch(() => console.warn('Port forwarding remote cleanup failed'));
  }

  private update(id: string, change: Partial<ForwardingEntry>) {
    this.publish(this.entries.map(entry => entry.id === id ? { ...entry, ...change } : entry));
  }

  private publish(entries: ForwardingEntry[]) {
    this.entries = entries;
    for (const listener of this.listeners) listener();
  }
}

function sameTarget(left: PortMapping, right: PortMapping) {
  return normalizeMappingHost(left.remoteHost) === normalizeMappingHost(right.remoteHost)
    && (left.protocol ?? 'tcp') === (right.protocol ?? 'tcp')
    && left.remotePort === right.remotePort && left.localPort === right.localPort;
}
