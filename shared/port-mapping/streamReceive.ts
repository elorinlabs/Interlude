import { STREAM_WINDOW_BYTES, STREAM_FRAME_BYTES, validatePosition } from './streamProtocol';
import { LINK_CHUNK_BYTES } from '../terminal/linkChunks';
import type { MappingRead } from './socket';

const MAX_PENDING_FRAGMENTS = 4096;

/** Sequence offsets survive path switches; only consumed bytes replenish the sender's window. */
export class StreamReceive {
  private readonly pending = new Map<number, Uint8Array>();
  private readonly ready: Uint8Array[] = [];
  private received = 0;
  private end?: number;
  consumed = 0;

  get eof() { return this.end === this.consumed; }
  push(offset: number, data: Uint8Array) {
    validatePosition(offset);
    const end = offset + data.length;
    validatePosition(end);
    if (!data.length || data.length > STREAM_FRAME_BYTES || end > this.consumed + STREAM_WINDOW_BYTES
      || this.end !== undefined && end > this.end) throw new Error('Stream receive window exceeded');
    if (end <= this.received) return;
    this.insert(offset, data);
    while (this.pending.has(this.received)) {
      const next = this.pending.get(this.received)!;
      this.pending.delete(this.received); this.ready.push(next); this.received += next.length;
    }
  }

  private insert(offset: number, data: Uint8Array) {
    // Retransmission may split a formerly larger record. Keep only ranges not received yet.
    const end = offset + data.length;
    let cursor = Math.max(offset, this.received);
    for (const [start, bytes] of [...this.pending].sort(([left], [right]) => left - right)) {
      if (start >= end) break;
      if (start > cursor) this.pending.set(cursor, data.subarray(cursor - offset, start - offset));
      cursor = Math.max(cursor, start + bytes.length);
    }
    if (cursor < end) this.pending.set(cursor, data.subarray(cursor - offset));
    if (this.pending.size > MAX_PENDING_FRAGMENTS) throw new Error('Too many stream fragments');
  }

  finish(offset: number) {
    validatePosition(offset);
    if (offset < this.received || offset > this.consumed + STREAM_WINDOW_BYTES
      || this.end !== undefined && this.end !== offset) throw new Error('Invalid stream end');
    for (const [start, data] of this.pending) {
      if (start + data.length > offset) throw new Error('Invalid stream end');
    }
    this.end = offset;
  }

  read(): MappingRead | undefined {
    if (!this.ready.length) return this.eof ? { data: new Uint8Array(), eof: true } : undefined;
    const length = Math.min(this.received - this.consumed, LINK_CHUNK_BYTES);
    const data = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      const next = this.ready[0];
      const count = Math.min(next.length, length - offset);
      data.set(next.subarray(0, count), offset); offset += count;
      if (count === next.length) this.ready.shift(); else this.ready[0] = next.subarray(count);
    }
    this.consumed += length;
    return { data, eof: this.eof };
  }

  clear() { this.pending.clear(); this.ready.length = 0; }
}
