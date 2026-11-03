import { MAX_PORT_MAPPINGS, mappingConfig, readMapping, type MappingStorage, type PortMapping } from './settings';
import type { PortForwardingService } from './service';

export interface MappingDocument { revision: number; mappings: PortMapping[]; accepted?: boolean }
export type MappingExchange = (document?: MappingDocument) => Promise<MappingDocument>;
const INTERVAL_MS = 5_000;
const SYNC_ERROR = '配置暂未同步，联网后会自动重试。';
const PROTOCOL_SYNC_ERROR = '协议设置暂未同步，本机映射仍可使用。';
const CAPACITY_CONFLICT = '最多同步 8 条映射，多出的映射已保留在本机。请删除不需要的映射后继续同步。';
type Pending = Record<string, PortMapping | null>;

/** Pending per-record edits survive restarts; compare-and-swap preserves unrelated concurrent edits. */
export class MappingSync {
  private pending: Pending;
  private busy = false;
  private disposed = false;
  private timer?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;
  private status = '';
  private readonly listeners = new Set<() => void>();
  private readonly key: string;

  constructor(private readonly service: PortForwardingService, private readonly options: {
    scope: string; storage: MappingStorage; exchange: MappingExchange;
  }) {
    this.key = 'codex-port-mapping-sync:' + options.scope;
    this.pending = this.readPending();
  }

  snapshot = () => this.status;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  start = () => {
    this.disposed = false;
    this.service.applySaved(mergeMappings(this.service.snapshot(), this.pending));
    this.unsubscribe = this.service.subscribeChanges((id, value) => {
      this.pending[id] = value ? mappingConfig(value) : null;
      this.setStatus('配置正在同步…');
      this.persist();
      void this.refresh();
    });
    this.timer = setInterval(() => { void this.refresh(); }, INTERVAL_MS);
    void this.refresh();
    return () => {
      this.disposed = true;
      clearInterval(this.timer);
      this.unsubscribe?.();
    };
  };

  refresh = async () => {
    if (this.busy || this.disposed) return;
    this.busy = true;
    try {
      let remote = readMappingDocument(await this.options.exchange());
      if (this.disposed) return;
      // A failed write must not prevent valid remote changes from reaching this device.
      this.service.applySaved(mergeMappings(remote.mappings, this.pending));
      // A conflicting device may win the CAS; fetch/merge again on the next bounded poll.
      const { sent, mappings } = planMappingUpload(remote.mappings, this.pending);
      if (Object.keys(sent).length) {
        remote = readMappingDocument(await this.options.exchange({ revision: remote.revision,
          mappings }));
        if (this.disposed) return;
        if (remote.accepted) {
          // Older servers accept unknown fields but omit them from stored JSON; never silently downgrade UDP.
          if (mappings.some(entry => entry.protocol && entry.protocol !== 'tcp'
            && remote.mappings.find(saved => saved.id === entry.id)?.protocol !== entry.protocol)) {
            throw new Error(PROTOCOL_SYNC_ERROR);
          }
          for (const [id, value] of Object.entries(sent)) {
            if (this.pending[id] === value) delete this.pending[id];
          }
        }
      }
      const persisted = this.persist();
      const visible = mergeMappings(remote.mappings, this.pending);
      this.service.applySaved(visible);
      if (persisted) this.updateStatus(visible);
    } catch (error) {
      if (!this.disposed) this.setStatus(error instanceof Error && error.message === PROTOCOL_SYNC_ERROR
        ? PROTOCOL_SYNC_ERROR : SYNC_ERROR);
    }
    finally { this.busy = false; }
  };

  private readPending(): Pending {
    try {
      const raw = this.options.storage.getItem(this.key);
      if (raw) {
        const data = JSON.parse(raw) as Pending;
        const pending: Pending = {};
        for (const [id, value] of Object.entries(data)) {
          if (!/^[\w-]{1,64}$/.test(id)) continue;
          const mapping = value && readMapping(value, () => id);
          if (value === null || mapping) pending[id] = mapping || null;
        }
        return pending;
      }
    } catch { this.setStatus(SYNC_ERROR); }
    return Object.fromEntries(this.service.snapshot().map(entry => [entry.id, mappingConfig(entry)]));
  }

  private updateStatus(visible: PortMapping[]) {
    if (visible.length > MAX_PORT_MAPPINGS) {
      this.setStatus(CAPACITY_CONFLICT);
      return;
    }
    this.setStatus(Object.keys(this.pending).length ? '配置正在同步…' : '配置已自动同步');
  }

  private persist() {
    try { this.options.storage.setItem(this.key, JSON.stringify(this.pending)); return true; }
    catch { this.setStatus('配置未能保存到本机，请检查存储空间。'); return false; }
  }

  private setStatus(value: string) {
    this.status = value;
    for (const listener of this.listeners) listener();
  }
}

function readMappingDocument(value: MappingDocument): MappingDocument {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0
    || !Array.isArray(value.mappings) || value.mappings.length > MAX_PORT_MAPPINGS) {
    throw new Error('Invalid mapping document');
  }
  const ids = new Set<string>();
  const mappings = value.mappings.map(entry => {
    if (!entry || typeof entry.id !== 'string' || !/^[\w-]{1,64}$/.test(entry.id) || ids.has(entry.id)) {
      throw new Error('Invalid mapping ID');
    }
    const parsed = readMapping(entry, () => entry.id);
    if (!parsed) throw new Error('Invalid mapping target');
    ids.add(entry.id);
    return parsed;
  });
  return { revision: value.revision, mappings, accepted: value.accepted === true };
}

/** Apply edits/deletions first, then fill available slots; overflow remains in the durable pending queue. */
function planMappingUpload(remote: PortMapping[], pending: Pending): { sent: Pending; mappings: PortMapping[] } {
  const remoteIds = new Set(remote.map(entry => entry.id));
  const changes = Object.entries(pending);
  const sent = Object.fromEntries(changes.filter(([id, value]) => !value || remoteIds.has(id)));
  let mappings = mergeMappings(remote, sent);
  for (const [id, value] of changes) {
    if (!value || remoteIds.has(id)) continue;
    const candidate = mergeMappings(mappings, { [id]: value });
    if (candidate.length > MAX_PORT_MAPPINGS) continue;
    sent[id] = value;
    mappings = candidate;
  }
  return { sent, mappings };
}

export function mergeMappings(remote: PortMapping[], pending: Pending): PortMapping[] {
  const merged = new Map(remote.map(entry => [entry.id, mappingConfig(entry)]));
  for (const [id, entry] of Object.entries(pending)) {
    if (!entry) { merged.delete(id); continue; }
    // Import identical legacy local settings only once across installations.
    const duplicate = !merged.has(id) && [...merged.values()].some(value =>
      value.remoteHost === entry.remoteHost && value.remotePort === entry.remotePort && value.localPort === entry.localPort
      && (value.protocol ?? 'tcp') === (entry.protocol ?? 'tcp'));
    if (!duplicate) merged.set(id, entry);
  }
  return [...merged.values()];
}

export function mappingSyncScope(scope: string): { baseUrl: string; account: string; deviceId: string } | undefined {
  try {
    const parts: unknown = JSON.parse(scope);
    if (!Array.isArray(parts) || parts.length !== 3 || !parts.every(value => typeof value === 'string' && value)) return;
    return { baseUrl: parts[0], account: parts[1], deviceId: parts[2] };
  } catch { return; }
}
