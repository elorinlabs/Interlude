import { invoke } from '../api/backend';
import type { TerminalLinkReply, TerminalLinkRequest } from '../../../../shared/terminal/links';
import { decodeBase64, encodeBase64 } from '../../../../shared/port-mapping/http';
import { MappingStreamMux, STREAM_MANIFEST, type StreamIdentity,
  type MappingStreamLink } from '../../../../shared/port-mapping/streamMux';
import type { MappingByteStream } from '../../../../shared/port-mapping/stream';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
interface Socket { resource: string; stream: MappingByteStream; remote?: string }

/** Resource ownership is checked by RemoteFiles before any stream is opened or closed. */
export class RemoteMappingStreams {
  private session?: { mux: MappingStreamMux; identity: StreamIdentity };
  private readonly sockets = new Map<string, Socket>();
  constructor(private readonly link: MappingStreamLink) {}

  async request(body: Record<string, unknown>) {
    if (typeof body.id !== 'string' || !UUID.test(body.id) || typeof body.resource !== 'string') {
      throw new Error('网页连接无效，请重新打开。');
    }
    if (body.action === 'close') {
      const socket = this.sockets.get(body.id);
      if (socket?.resource === body.resource) socket.stream.close();
      return;
    }
    if (body.action !== 'open' || typeof body.url !== 'string') throw new Error('网页连接无效，请重新打开。');
    const identity = this.identity(body);
    const mux = this.session?.mux ?? this.create(identity);
    const id = body.id, resource = body.resource;
    const stream = mux.open(id, () => this.release(id));
    const socket: Socket = { resource, stream };
    this.sockets.set(id, socket);
    try {
      const opened = await this.socketRequest(resource, { type: 'connect', url: body.url });
      if (opened.type !== 'socket') throw new Error('无法连接网页，请确认服务已启动。');
      socket.remote = opened.id;
      if (this.sockets.get(id) !== socket) { this.closeRemote(socket); throw new Error('网页连接已关闭。'); }
      void Promise.race([this.download(socket), this.upload(socket)])
        .catch(() => { /* Closing both ends reports a socket failure to the browser. */ }).finally(() => stream.close());
      return { id };
    } catch (error) { stream.close(); throw error; }
  }

  private identity(body: Record<string, unknown>): StreamIdentity {
    if (this.session?.mux.closed) this.session = undefined;
    const { transferId, epoch } = body;
    if (typeof transferId !== 'string' || !UUID.test(transferId) || typeof epoch !== 'string' || !UUID.test(epoch)) {
      throw new Error('网页连接无效，请重新打开。');
    }
    if (this.session && (this.session.identity.transferId !== transferId || this.session.identity.epoch !== epoch)) {
      throw new Error('网页连接已变更，请重新连接电脑。');
    }
    return { transferId, epoch };
  }
  private create(identity: StreamIdentity) {
    const transport = this.link.bulk;
    if (!transport?.path) throw new Error('网页连接暂不可用，请重试。');
    const cipher = this.link.createBulkCipher({ ...identity, manifestId: STREAM_MANIFEST });
    const mux = new MappingStreamMux({ transport, cipher, identity });
    this.session = { mux, identity };
    return mux;
  }
  private async download(socket: Socket) {
    for (;;) {
      const reply = await this.socketRequest(socket.resource, { type: 'read', id: socket.remote! });
      if (reply.type !== 'data') throw new Error('Socket closed');
      if (reply.data) await socket.stream.write(decodeBase64(reply.data));
      if (reply.eof) { await socket.stream.end(); return; }
    }
  }
  private async upload(socket: Socket) {
    for (;;) {
      const reply = await socket.stream.read();
      if (reply.data.length) await this.socketRequest(socket.resource,
        { type: 'write', id: socket.remote!, data: encodeBase64(reply.data) });
      if (reply.eof) return;
    }
  }
  private socketRequest(resource: string, request: TerminalLinkRequest) {
    return invoke<TerminalLinkReply>('codex_gui_resource_link', { request: { ...request, scope: resource } });
  }
  private closeRemote(socket: Socket) {
    if (socket.remote) void this.socketRequest(socket.resource, { type: 'close', id: socket.remote }).catch(() => {
      // The resource's stop operation also releases sockets if the runtime has disconnected.
    });
  }
  private release(id: string) {
    const socket = this.sockets.get(id);
    if (!socket) return;
    this.sockets.delete(id); this.closeRemote(socket);
  }
  closeResource(resource: string) {
    for (const socket of this.sockets.values()) if (socket.resource === resource) socket.stream.close();
  }
  close() { this.session?.mux.close(); this.session = undefined; }
}
