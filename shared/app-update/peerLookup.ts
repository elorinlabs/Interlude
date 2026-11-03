export interface UpdatePeerConfig {
  sessionId: string; secret: string; desktop: false; expiresAt: number; servers: string[]; stunServers: string[];
  packageProtocol?: number;
  sameAccount?: boolean;
}
export interface UpdatePeerLease { configs: UpdatePeerConfig[]; close(): void; failed(sessionId: string): void }
export interface UpdatePeerSession { baseUrl: string; accessToken: string }
const LOOKUP_TIMEOUT_MS = 6_000;

export function validUpdatePeerConfig(value: unknown): value is UpdatePeerConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<UpdatePeerConfig>;
  return typeof config.sessionId === 'string' && /^update-[\da-f-]{36}$/.test(config.sessionId)
    && typeof config.secret === 'string' && /^[\da-f]{64}$/.test(config.secret) && config.desktop === false
    && typeof config.expiresAt === 'number' && config.expiresAt > Date.now()
    && config.expiresAt <= Date.now() + 21 * 60_000
    && [config.servers, config.stunServers].every(list => Array.isArray(list)
      && list.length <= 16 && list.every(item => typeof item === 'string' && item.length <= 512));
}

/** Metadata remains on GitHub; the authenticated broker only grants isolated package connections. */
export function findUpdatePeers(session: UpdatePeerSession, artifact: string,
  options: { protocol?: number; ownOnly?: boolean } = {}): Promise<UpdatePeerLease> {
  return new Promise((resolve, reject) => {
    const url = new URL(session.baseUrl);
    if (!['https:', 'http:'].includes(url.protocol) || !/^[\da-f]{64}$/.test(artifact)) {
      reject(new Error('Update sharing unavailable')); return;
    }
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/device-switch`;
    url.search = ''; url.hash = '';
    const socket = new WebSocket(url.toString());
    const requestId = 'android-update';
    let settled = false;
    let requested = false;
    let sessions: string[] = [];
    const close = () => {
      clearTimeout(timer);
      if (socket.readyState === WebSocket.OPEN) {
        sessions.forEach(sessionId => socket.send(JSON.stringify({ type: 'update-peer-done', sessionId })));
      }
      sessions = []; socket.close();
    };
    const fail = () => {
      if (settled) return;
      settled = true; close(); reject(new Error('Update sharing unavailable'));
    };
    const timer = setTimeout(fail, LOOKUP_TIMEOUT_MS);
    socket.onopen = () => socket.send(JSON.stringify({ type: 'subscribe-devices', accessToken: session.accessToken }));
    socket.onerror = fail; socket.onclose = fail;
    socket.onmessage = event => {
      if (settled || typeof event.data !== 'string' || event.data.length > 32_768) return;
      try {
        const message = JSON.parse(event.data) as Record<string, unknown>;
        if (message.type === 'devices-snapshot' && !requested) {
          requested = true;
          socket.send(JSON.stringify({ type: 'update-peer-find', requestId, artifact, maxPeers: 3,
            packageProtocol: options.protocol ?? 2, ownOnly: options.ownOnly === true }));
        }
        if (message.requestId !== requestId) return;
        if (message.type === 'update-peer-unavailable') { fail(); return; }
        const configs = message.type === 'update-peer-offers' ? message.configs : [message.config];
        if (message.artifact !== artifact || !Array.isArray(configs) || !configs.length || configs.length > 3
          || !configs.every(validUpdatePeerConfig)
          || (options.ownOnly === true && configs.some(config => !config.sameAccount))
          || new Set(configs.map(config => config.sessionId)).size !== configs.length) {
          fail(); return;
        }
        sessions = configs.map(config => config.sessionId);
        const failed = (sessionId: string) => {
          if (sessions.includes(sessionId) && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'update-peer-done', sessionId, failed: true }));
          }
        };
        settled = true; clearTimeout(timer); resolve({ configs, close, failed });
      } catch { fail(); }
    };
  });
}
