import type { MappingRead, MappingSocket } from './socket';
import { StreamReceive } from './streamReceive';
import { STREAM_FRAME_BYTES, STREAM_WINDOW_BYTES, type StreamFrame, validatePosition } from './streamProtocol';
import type { NativeStreamProgress } from './streamClient';

const TICK_MS = 250;
const RETRY_MS = 750;
const STALL_MS = 30_000;
const ACK_DELAY_MS = 8;
const ACK_BYTES = STREAM_WINDOW_BYTES / 4;
const BATCH_FRAMES = 16;
interface Pending { frame: Extract<StreamFrame, { type: 'data' }>; sent?: number }

/** Continuous duplex bytes with bounded credit, ordered delivery, and replay after a transport switch. */
export class MappingByteStream implements MappingSocket {
  private readonly incoming = new StreamReceive();
  private readonly nativeIncoming = { consumed: 0, eof: false };
  private readonly pending = new Map<number, Pending>();
  private readonly waiters = new Set<() => void>();
  private readonly timer: ReturnType<typeof setInterval>;
  private ackTimer?: ReturnType<typeof setTimeout>;
  private ackPending = false;
  private ackSending = false;
  private transportRevision = 0;
  private acknowledged = 0;
  private sent = 0;
  private lastAck = 0;
  private progress = Date.now();
  private ended = false;
  private endAcknowledged = false;
  private endSent?: number;
  private reading = false;
  private writing = false;
  private pumping = false;
  private error?: Error;
  get closed() { return !!this.error; }

  constructor(private readonly wire: {
    send: (frames: StreamFrame[]) => Promise<void>; closed: () => void; nativeReceive?: boolean;
    /** Reliable paths already retransmit packets; only explicit failures or path changes need replay. */
    reliable: () => boolean;
  }) {
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  receive(frame: StreamFrame) {
    if (this.error) return;
    try {
      if (frame.type === 'close') { this.stop(new Error('Socket closed')); return; }
      if (frame.type === 'ack') this.acknowledge(frame.offset, frame.eof);
      if (this.wire.nativeReceive && (frame.type === 'data' || frame.type === 'end')) {
        throw new Error('Native stream payload escaped its receiver');
      }
      if (frame.type === 'data') this.incoming.push(frame.offset, frame.data);
      if (frame.type === 'end') this.incoming.finish(frame.offset);
      if (frame.type !== 'ack') this.scheduleAck();
      this.wake();
    } catch { this.close(); }
  }

  /** Native progress replenishes credit only after bytes have reached the local TCP socket. */
  receiveNativeProgress(progress: NativeStreamProgress) {
    if (this.error) return;
    try {
      validatePosition(progress.consumed);
      if (!this.wire.nativeReceive || progress.failed || progress.consumed < this.nativeIncoming.consumed
        || this.nativeIncoming.eof && (!progress.eof || progress.consumed !== this.nativeIncoming.consumed)) {
        throw new Error('Invalid native stream progress');
      }
      Object.assign(this.nativeIncoming, progress);
      this.scheduleAck(); this.wake();
    } catch { this.close(); }
  }

  async read(): Promise<MappingRead> {
    if (this.reading) throw new Error('Stream read already pending');
    this.reading = true;
    try {
      for (;;) {
        this.check();
        const result = this.wire.nativeReceive
          ? (this.nativeIncoming.eof ? { data: new Uint8Array(), eof: true } : undefined) : this.incoming.read();
        if (result) { this.scheduleAck(); return result; }
        await this.wait();
      }
    } finally { this.reading = false; }
  }

  async write(bytes: Uint8Array) {
    if (this.writing || this.ended) throw new Error('Stream write unavailable');
    this.writing = true;
    try {
      for (let offset = 0; offset < bytes.length;) {
        this.check();
        const capacity = STREAM_WINDOW_BYTES - (this.sent - this.acknowledged);
        if (!capacity) { await this.wait(); continue; }
        const count = Math.min(capacity, STREAM_FRAME_BYTES, bytes.length - offset);
        validatePosition(this.sent + count);
        if (!this.pending.size) this.progress = Date.now();
        const frame = { type: 'data' as const, offset: this.sent, data: new Uint8Array(bytes.subarray(offset, offset + count)) };
        this.pending.set(this.sent, { frame });
        this.sent += count; offset += count;
        void this.pump();
      }
    } finally { this.writing = false; }
  }

  async end() {
    this.check();
    if (this.writing) throw new Error('Stream write pending');
    this.ended = true; this.progress = Date.now();
    void this.pump();
    while (!this.endAcknowledged) { this.check(); await this.wait(); }
  }

  /** An authenticated path change keeps byte offsets and unacknowledged data intact. */
  retry() {
    this.transportRevision++;
    for (const pending of this.pending.values()) pending.sent = undefined;
    this.endSent = undefined; this.scheduleAck(); void this.pump();
  }

  close() {
    if (this.error) return;
    void this.wire.send([{ type: 'close' }]).catch(() => {
      // The resource owner also closes the remote socket through its reliable control channel.
    });
    this.stop(new Error('Socket closed'));
  }

  private acknowledge(offset: number, eof: boolean) {
    validatePosition(offset);
    if (offset > this.sent || eof && (!this.ended || offset !== this.sent)) throw new Error('Invalid stream ack');
    if (offset < this.acknowledged) return;
    if (offset > this.acknowledged) this.progress = Date.now();
    this.acknowledged = offset;
    for (const [start, pending] of this.pending) {
      if (start + pending.frame.data.length <= offset) this.pending.delete(start);
    }
    if (eof) this.endAcknowledged = true;
  }

  private scheduleAck() {
    this.ackPending = true;
    const incoming = this.wire.nativeReceive ? this.nativeIncoming : this.incoming;
    if (incoming.consumed - this.lastAck >= ACK_BYTES || incoming.eof) { this.sendAck(); return; }
    this.ackTimer ??= setTimeout(() => this.sendAck(), ACK_DELAY_MS);
  }
  private sendAck() {
    clearTimeout(this.ackTimer); this.ackTimer = undefined;
    if (this.error || this.ackSending) return;
    const incoming = this.wire.nativeReceive ? this.nativeIncoming : this.incoming;
    this.lastAck = incoming.consumed;
    this.ackPending = false; this.ackSending = true;
    void this.wire.send([{ type: 'ack', offset: this.lastAck, eof: incoming.eof }]).then(() => {
      this.ackSending = false;
      if (this.ackPending) this.scheduleAck();
    }, () => {
      // Reliable payloads are not replayed just to solicit another ACK. Retry failed credit independently.
      this.ackSending = false; this.ackPending = true;
    });
  }

  private isSendDue(sent: number | undefined) {
    return sent === undefined || !this.wire.reliable() && Date.now() - sent >= RETRY_MS;
  }

  private async sendBatch(batch: Pending[]) {
    const revision = this.transportRevision;
    for (const value of batch) value.sent = undefined;
    await this.wire.send(batch.map(value => value.frame));
    // Queueing time is not packet loss. A concurrent path change must still replay these bytes.
    if (revision !== this.transportRevision) return;
    const sent = Date.now();
    for (const value of batch) value.sent = sent;
  }

  private async sendEnd() {
    if (!this.ended || this.endAcknowledged || !this.isSendDue(this.endSent)) return;
    const revision = this.transportRevision;
    this.endSent = undefined; await this.wire.send([{ type: 'end', offset: this.sent }]);
    if (revision === this.transportRevision) this.endSent = Date.now();
  }

  private async pump() {
    if (this.pumping || this.error) return;
    this.pumping = true;
    try {
      for (;;) {
        this.check();
        const pending = [...this.pending.values()];
        const unsent = pending.filter(value => value.sent === undefined);
        const batch = (unsent.length ? unsent : pending.filter(value => this.isSendDue(value.sent)))
          .slice(0, BATCH_FRAMES);
        if (!batch.length) break;
        await this.sendBatch(batch);
      }
      await this.sendEnd();
    } catch { /* Retain the bounded window until the next path/retry or stall deadline. */ }
    finally { this.pumping = false; }
  }

  private tick() {
    if ((this.pending.size || this.ended && !this.endAcknowledged) && Date.now() - this.progress >= STALL_MS) {
      this.close(); return;
    }
    if (this.ackPending) this.sendAck();
    void this.pump();
  }
  private stop(error: Error) {
    if (this.error) return;
    this.error = error;
    clearInterval(this.timer); clearTimeout(this.ackTimer);
    this.pending.clear(); this.incoming.clear(); this.wake(); this.wire.closed();
  }
  private check() { if (this.error) throw this.error; }
  private wait() { return new Promise<void>(resolve => this.waiters.add(resolve)); }
  private wake() { for (const resolve of this.waiters) resolve(); this.waiters.clear(); }
}
