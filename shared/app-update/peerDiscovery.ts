import { validUpdatePeerConfig, type UpdatePeerConfig, type UpdatePeerLease, type UpdatePeerSession } from './peerLookup';

const REFILL_INTERVAL_MS = 12_000;
const LOOKUP_TIMEOUT_MS = 6_000;
const MAX_PEERS = 3;
interface Options {
  session: UpdatePeerSession;
  artifact: string;
  onPeers(configs: UpdatePeerConfig[]): Promise<boolean>;
}

/** Keep authenticated discovery alive while the native downloader retains its independent direct connections. */
export function watchUpdatePeers(options: Options): Promise<UpdatePeerLease> {
  return new Promise((resolve, reject) => { new Discovery(options, resolve, reject).start(); });
}

class Discovery {
  private socket: WebSocket;
  private sessions = new Set<string>();
  private timer?: ReturnType<typeof setTimeout>;
  private interval?: ReturnType<typeof setInterval>;
  private requestId = '';
  private sequence = 0;
  private authenticated = false;
  private initialized = false;
  private closed = false;
  private delivering = false;

  constructor(private options: Options, private resolve: (lease: UpdatePeerLease) => void,
    private reject: (reason: Error) => void) {
    const url = new URL(options.session.baseUrl);
    if (!['https:', 'http:'].includes(url.protocol) || !/^[\da-f]{64}$/.test(options.artifact)) {
      throw new Error('Update sharing unavailable');
    }
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/device-switch`;
    url.search = ''; url.hash = '';
    this.socket = new WebSocket(url.toString());
  }

  start() {
    this.timer = setTimeout(() => this.fail(), LOOKUP_TIMEOUT_MS);
    this.socket.onopen = () => this.send({ type: 'subscribe-devices', accessToken: this.options.session.accessToken });
    this.socket.onerror = () => this.fail();
    this.socket.onclose = () => this.fail();
    this.socket.onmessage = event => this.receive(event.data);
    this.interval = setInterval(() => this.find(), REFILL_INTERVAL_MS);
  }

  private send(message: object) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private find() {
    if (this.closed || !this.authenticated || this.requestId || this.delivering || this.sessions.size >= MAX_PEERS) return;
    this.requestId = `android-update-${++this.sequence}`;
    this.send({ type: 'update-peer-find', requestId: this.requestId, artifact: this.options.artifact,
      maxPeers: MAX_PEERS, packageProtocol: 2, ownOnly: false, refill: true });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.requestId = ''; this.initialize([]); }, LOOKUP_TIMEOUT_MS);
  }

  private receive(value: unknown) {
    if (this.closed || typeof value !== 'string' || value.length > 32_768) return;
    try {
      const message = JSON.parse(value) as Record<string, unknown>;
      if (message.type === 'devices-snapshot' && !this.authenticated) {
        this.authenticated = true; this.find(); return;
      }
      if (message.type === 'update-peer-cancel' && typeof message.sessionId === 'string') {
        this.sessions.delete(message.sessionId); return;
      }
      if (!this.requestId || message.requestId !== this.requestId) {
        this.releaseLateOffer(message); return;
      }
      clearTimeout(this.timer); this.requestId = '';
      if (message.type === 'update-peer-unavailable') { this.initialize([]); return; }
      const configs = message.type === 'update-peer-offers' ? message.configs : [message.config];
      if (message.artifact !== this.options.artifact || !Array.isArray(configs) || !configs.length
        || configs.length + this.sessions.size > MAX_PEERS || !configs.every(validUpdatePeerConfig)
        || configs.some(config => config.packageProtocol !== 2 || this.sessions.has(config.sessionId))
        || new Set(configs.map(config => config.sessionId)).size !== configs.length) { this.fail(); return; }
      configs.forEach(config => this.sessions.add(config.sessionId));
      if (!this.initialized) this.initialize(configs);
      else void this.deliver(configs);
    } catch { this.fail(); }
  }

  private releaseLateOffer(message: Record<string, unknown>) {
    if (typeof message.requestId !== 'string' || !message.requestId.startsWith('android-update-')) return;
    const offered = message.type === 'update-peer-offers' ? message.configs : [message.config];
    if (!Array.isArray(offered) || offered.length > MAX_PEERS) return;
    for (const config of offered) {
      if (validUpdatePeerConfig(config) && !this.sessions.has(config.sessionId)) {
        this.send({ type: 'update-peer-done', sessionId: config.sessionId });
      }
    }
  }

  private initialize(configs: UpdatePeerConfig[]) {
    if (this.initialized || this.closed) return;
    this.initialized = true;
    this.resolve({ configs, close: () => this.close(), failed: id => this.failed(id) });
  }

  private async deliver(configs: UpdatePeerConfig[]) {
    this.delivering = true;
    try {
      if (!await this.options.onPeers(configs)) configs.forEach(config => this.failed(config.sessionId));
    } catch { configs.forEach(config => this.failed(config.sessionId)); }
    finally { this.delivering = false; }
  }

  private failed(id: string) {
    if (!this.sessions.delete(id)) return;
    this.send({ type: 'update-peer-done', sessionId: id, failed: true });
  }

  private fail() {
    if (!this.initialized) this.reject(new Error('Update sharing unavailable'));
    this.close();
  }

  private close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer); clearInterval(this.interval);
    this.sessions.forEach(sessionId => this.send({ type: 'update-peer-done', sessionId }));
    this.sessions.clear(); this.socket.close();
  }
}
