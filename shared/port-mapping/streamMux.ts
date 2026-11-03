import type { BulkCipher } from '../remote-chat/bulkCipher';
import type { BulkTransport } from '../remote-chat/bulkTransport';
import { BULK_HEADER_BYTES, BULK_TAG_BYTES } from '../remote-chat/bulkProtocol';
import { MappingByteStream } from './stream';
import { decodeStreamFrame, encodeStreamFrame, splitStreamFrames, type StreamFrame } from './streamProtocol';
import { BULK_LIMITS } from '../remote-chat/bulkLimits';
import type { ChatLink } from '../remote-chat/link';
import type { NativeStreamProgress } from './streamClient';

export type MappingStreamLink = Pick<ChatLink, 'bulk' | 'createBulkCipher'>;

export const STREAM_OPERATION = 'guiResourceStream';
export const STREAM_MANIFEST = 'remote-ai:port-stream:v1';
export const MAX_MAPPING_STREAMS = 24;
export interface StreamIdentity { transferId: string; epoch: string }
export interface StreamOpen extends StreamIdentity { action: 'open'; resource: string; url: string; id: string }

/** Socket ids and their byte sequence spaces are scoped to one authenticated link and one cipher epoch. */
export class MappingStreamMux {
  private readonly streams = new Map<string, MappingByteStream>();
  private readonly abort = new AbortController();
  private readonly unsubscribe: () => void;
  private sending = Promise.resolve();
  private nativeReceive?: (record: Uint8Array) => void;
  get closed() { return this.abort.signal.aborted; }

  constructor(private readonly options: {
    transport: BulkTransport; cipher: BulkCipher; identity: StreamIdentity;
  }) {
    this.unsubscribe = options.transport.listenStream(options.identity.transferId, {
      epoch: options.identity.epoch,
      record: bytes => this.receive(bytes),
      changed: () => { for (const stream of this.streams.values()) stream.retry(); },
      closed: () => this.close(),
    });
  }

  open(id: string, closed: () => void, nativeReceive = false) {
    if (this.abort.signal.aborted || this.streams.has(id) || this.streams.size >= MAX_MAPPING_STREAMS) {
      throw new Error('Port mapping connection unavailable');
    }
    const stream = new MappingByteStream({
      send: frames => this.send(id, frames),
      closed: () => { this.streams.delete(id); closed(); },
      nativeReceive,
      reliable: () => this.options.transport.path === 'relay',
    });
    this.streams.set(id, stream);
    return stream;
  }

  private send(id: string, frames: StreamFrame[]) {
    // Encryption runs in the same queue as transmission so sequence order remains deterministic.
    const sent = this.sending.then(async () => {
      if (this.abort.signal.aborted) throw new Error('Stream closed');
      const { transport, cipher } = this.options;
      const path = transport.path;
      if (!path) throw new Error('Stream path unavailable');
      const maximum = transport.recordBytes - BULK_HEADER_BYTES - BULK_TAG_BYTES;
      let records: Uint8Array[] = [];
      for (const frame of splitStreamFrames(frames, maximum)) {
        records.push(cipher.encrypt({ requestId: id, block: 0, offset: 0 }, encodeStreamFrame(frame)));
        if (records.length === BULK_LIMITS.sendBatchRecords) {
          await transport.sendBatch(records, path, this.abort.signal); records = [];
        }
      }
      if (records.length) await transport.sendBatch(records, path, this.abort.signal);
    });
    this.sending = sent.catch(() => undefined);
    return sent;
  }

  private receive(record: Uint8Array) {
    try {
      if (this.nativeReceive) { this.nativeReceive(record); return; }
      const decoded = this.options.cipher.decryptStream(record);
      if (!decoded) return;
      this.receiveAuthenticated(decoded.header.requestId, decoded.bytes);
    } catch { this.close(); }
  }

  useNativeReceiver(receive: (record: Uint8Array) => void) { this.nativeReceive = receive; }

  /** Only for a local receiver that has authenticated the epoch and enforced the cipher replay window. */
  receiveAuthenticated(id: string, bytes: Uint8Array) {
    if (this.closed) return;
    try { this.streams.get(id)?.receive(decodeStreamFrame(bytes)); }
    catch { this.close(); }
  }

  receiveNativeProgress(id: string, progress: NativeStreamProgress) {
    if (!this.closed) this.streams.get(id)?.receiveNativeProgress(progress);
  }

  close() {
    if (this.abort.signal.aborted) return;
    this.abort.abort(); this.unsubscribe();
    for (const stream of this.streams.values()) stream.close();
    this.streams.clear(); this.options.cipher.destroy();
  }
}
