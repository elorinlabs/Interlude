import { MappingStreamMux, STREAM_MANIFEST, STREAM_OPERATION, type StreamIdentity,
  type MappingStreamLink } from './streamMux';
import type { MappingSocketFactory } from './socket';
import { MAPPING_RECONNECT_REQUIRED, MAPPING_UPDATE_REQUIRED } from './errors';

export interface NativeStreamProgress { consumed: number; eof: boolean; failed?: boolean }
export interface MappingStreamReceiver {
  close(): void;
  bind(id: string, socketId: number): Promise<void>;
  unbind(id: string): void;
  /** Route browser RTC arrivals to the same native authenticator used by direct/relay arrivals. */
  receive?(record: Uint8Array): void;
}
export type MappingStreamBridge = (options: { identity: StreamIdentity;
  receiverKey: Uint8Array; authenticated: (id: string, bytes: Uint8Array) => void;
  progress: (id: string, progress: NativeStreamProgress) => void;
  failed: () => void }) => Promise<MappingStreamReceiver | undefined>;

interface StreamSession {
  link: MappingStreamLink; mux: MappingStreamMux; identity: StreamIdentity;
  ready: Promise<MappingStreamReceiver | undefined>; released: boolean;
}

export class MappingStreamClient {
  private current?: StreamSession;
  constructor(private readonly options: {
    link: () => MappingStreamLink | undefined; supported: () => boolean; random: (length: number) => Uint8Array;
    request: <T>(body: object) => Promise<T>;
    register?: MappingStreamBridge;
    failed?: () => void;
  }) {}

  open: MappingSocketFactory = async (resource, url, options) => {
    const link = this.options.link();
    if (!this.options.supported()) throw new Error(MAPPING_UPDATE_REQUIRED);
    if (!link?.bulk?.path) throw new Error(MAPPING_RECONNECT_REQUIRED);
    const session = this.session(link);
    const receiver = await session.ready.catch(() => { session.mux.close(); return undefined; });
    if (!this.isCurrent(session)) throw new Error('Mapping connection changed');
    if (session.mux.closed) { this.invalidate(session); throw new Error(MAPPING_RECONNECT_REQUIRED); }
    if (options?.nativeSocketId !== undefined && !receiver) throw new Error(MAPPING_UPDATE_REQUIRED);
    const { mux, identity } = session;
    const id = this.uuid();
    const close = () => {
      receiver?.unbind(id);
      void this.options.request({ operation: STREAM_OPERATION, action: 'close', resource, id }).catch(() => {
        // Resource/session teardown is the final cleanup when control transport is disconnected.
      });
    };
    const stream = mux.open(id, close, options?.nativeSocketId !== undefined);
    try {
      if (options?.nativeSocketId !== undefined) await receiver!.bind(id, options.nativeSocketId);
      if (stream.closed || !this.isCurrent(session)) throw new Error('Mapping connection closed');
      await this.options.request({ operation: STREAM_OPERATION, action: 'open', resource, url, id, ...identity });
      if (stream.closed || !this.isCurrent(session)) throw new Error('Mapping connection closed');
      return stream;
    } catch (error) {
      stream.close();
      if (mux.closed) this.invalidate(session);
      throw error;
    }
  };

  private isCurrent(session: StreamSession) {
    return this.current === session && this.options.link() === session.link;
  }

  private session(link: MappingStreamLink) {
    // An epoch and nonce space live for the complete authenticated link. After receiver failure,
    // reconnect instead of reusing keys or silently switching to request/response forwarding.
    if (this.current?.link === link) return this.current;
    this.close();
    const identity = { transferId: this.uuid(), epoch: this.uuid() };
    const cipher = link.createBulkCipher({ ...identity, manifestId: STREAM_MANIFEST });
    const mux = new MappingStreamMux({ transport: link.bulk!, cipher, identity });
    const ready = this.register({ mux, identity, receiverKey: cipher.receiverMaterial().key });
    void ready.catch(() => mux.close());
    this.current = { link, mux, identity, ready, released: false };
    return this.current;
  }

  private async register({ mux, identity, receiverKey }: {
    mux: MappingStreamMux; identity: StreamIdentity; receiverKey: Uint8Array;
  }) {
    try {
      const receiver = await this.options.register?.({ identity, receiverKey,
        authenticated: (id, bytes) => mux.receiveAuthenticated(id, bytes),
        progress: (id, progress) => mux.receiveNativeProgress(id, progress),
        failed: () => {
          mux.close();
          if (this.current?.mux === mux) this.invalidate(this.current);
        } });
      if (receiver?.receive) mux.useNativeReceiver(receiver.receive);
      return receiver;
    } finally { receiverKey.fill(0); }
  }

  private invalidate(session: StreamSession) {
    if (session.released) return;
    const current = this.isCurrent(session);
    this.release(session);
    // A broken receiver cannot reuse its nonce space. Let the owner replace the authenticated link.
    if (current) this.options.failed?.();
  }

  private release(session: StreamSession) {
    if (session.released) return;
    session.released = true;
    void session.ready.then(receiver => receiver?.close()).catch(() => {
      // A failed registration has no native receiver to release.
    });
  }
  private uuid() {
    const bytes = this.options.random(16);
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  close() {
    this.current?.mux.close();
    if (this.current) this.release(this.current);
    this.current = undefined;
  }
}
