import { decodeRelay, encodeRelay } from '../../remote-chat/relayWire';
import { DEFAULT_CHAT_POLICY } from '../../chat/chatPolicy';

interface Endpoint { send: (data: string | Uint8Array) => void; close: () => void }
interface Client { endpoint: Endpoint; owner: string; key?: string }
interface Pair { id: string; left: Client; right: Client }

/** Test coordinator only: real client encryption, framing, RPC, RTC and local stores remain in use. */
export class LoungeSyncBroker {
  readonly generations = new Map<string, number>();
  readonly clients = new Set<Client>();
  private pairs = new Map<string, Pair>();
  relayFrames = 0;
  signalFrames = 0;
  fail = false;

  attach(endpoint: Endpoint, owner = 'alice') {
    const client: Client = { endpoint, owner };
    const receive = (data: string | Uint8Array) => {
      const text = typeof data === 'string' ? data : decodeRelay(new Uint8Array(data).buffer);
      const frame = JSON.parse(text) as Record<string, unknown>;
      if (frame.type === 'authenticate') { this.register(client, frame); return; }
      if (frame.type === 'renew-auth') { this.send(client, { type: 'auth-renewed' }); return; }
      if (frame.type === 'history-generations') {
        this.send(client, { type: 'history-generations', id: frame.id,
          generations: Object.fromEntries((frame.peers as string[]).map(peer => [peer, this.generations.get(peer) ?? 0])) });
        return;
      }
      const pair = this.pairs.get(String(frame.sessionId));
      if (!pair) return; // An encrypted frame can already be in flight when the other device disconnects.
      if (pair.left !== client && pair.right !== client) throw new Error('Unknown test session');
      if (frame.type === 'relay') this.relayFrames++;
      if (frame.type === 'signal') this.signalFrames++;
      this.send(pair.left === client ? pair.right : pair.left, frame);
    };
    return { receive, disconnect: () => this.disconnect(client) };
  }

  private send(client: Client, frame: object) { client.endpoint.send(encodeRelay(JSON.stringify(frame))); }

  private register(client: Client, frame: Record<string, unknown>) {
    if (this.fail) { client.endpoint.close(); return; }
    if (frame.role !== 'lounge' || frame.transportVersion !== 2 || frame.binaryRelay !== true) {
      throw new Error('History must use the authenticated existing binary transport');
    }
    client.key = String(frame.publicKey);
    this.send(client, { type: 'chat-policy', binaryRelay: true, policy: DEFAULT_CHAT_POLICY });
    this.send(client, { type: 'sync-registered' });
    for (const other of this.clients) {
      if (other.owner !== client.owner) continue;
      const pair = { id: crypto.randomUUID(), left: other, right: client };
      this.pairs.set(pair.id, pair);
      const common = { type: 'sync-peer', sessionId: pair.id, iceServers: [], expiresAt: Date.now() + 600_000 };
      this.send(other, { ...common, desktop: true, publicKey: client.key });
      this.send(client, { ...common, desktop: false, publicKey: other.key });
    }
    this.clients.add(client);
  }

  private disconnect(client: Client) {
    this.clients.delete(client);
    for (const [id, pair] of this.pairs) {
      if (pair.left !== client && pair.right !== client) continue;
      this.pairs.delete(id);
      this.send(pair.left === client ? pair.right : pair.left, { type: 'peer-close', sessionId: id });
    }
  }

  disconnectAll() {
    for (const client of [...this.clients]) { this.disconnect(client); client.endpoint.close(); }
  }
}
