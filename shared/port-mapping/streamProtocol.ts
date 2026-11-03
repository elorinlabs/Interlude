import { BULK_PAYLOAD_BYTES } from '../remote-chat/bulkProtocol';

export const STREAM_WINDOW_BYTES = 2 * 1024 * 1024;
export const STREAM_HEADER_BYTES = 9;
const POSITION_BYTES = STREAM_HEADER_BYTES;
const UINT32_RANGE = 0x1_0000_0000;
export const STREAM_FRAME_BYTES = BULK_PAYLOAD_BYTES - POSITION_BYTES;
export type StreamFrame = { type: 'data'; offset: number; data: Uint8Array }
  | { type: 'ack'; offset: number; eof: boolean } | { type: 'end'; offset: number } | { type: 'close' };
const DATA = 1, ACK = 2, ACK_END = 3, END = 4, CLOSE = 5;

export function encodeStreamFrame(frame: StreamFrame): Uint8Array {
  if (frame.type === 'close') return Uint8Array.of(CLOSE);
  validatePosition(frame.offset);
  const size = frame.type === 'data' ? frame.data.length : 0;
  if (frame.type === 'data' && (!size || size > STREAM_FRAME_BYTES)) throw new Error('Invalid stream frame');
  const bytes = new Uint8Array(POSITION_BYTES + size);
  bytes[0] = frame.type === 'data' ? DATA : frame.type === 'end' ? END : frame.eof ? ACK_END : ACK;
  const view = new DataView(bytes.buffer);
  view.setUint32(1, Math.floor(frame.offset / UINT32_RANGE));
  view.setUint32(5, frame.offset % UINT32_RANGE);
  if (frame.type === 'data') bytes.set(frame.data, POSITION_BYTES);
  return bytes;
}

export function decodeStreamFrame(bytes: Uint8Array): StreamFrame {
  if (bytes[0] === CLOSE && bytes.length === 1) return { type: 'close' };
  if (bytes.length < POSITION_BYTES || bytes.length > BULK_PAYLOAD_BYTES) throw new Error('Invalid stream frame');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = view.getUint32(1) * UINT32_RANGE + view.getUint32(5);
  validatePosition(offset);
  if (bytes[0] === DATA && bytes.length > POSITION_BYTES) {
    return { type: 'data', offset, data: bytes.subarray(POSITION_BYTES) };
  }
  if (bytes.length !== POSITION_BYTES) throw new Error('Invalid stream frame');
  if (bytes[0] === ACK || bytes[0] === ACK_END) return { type: 'ack', offset, eof: bytes[0] === ACK_END };
  if (bytes[0] === END) return { type: 'end', offset };
  throw new Error('Invalid stream frame');
}

export function validatePosition(offset: number) {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid stream position');
}

/** Reframe retained bytes when a replacement path negotiates a smaller record limit. */
export function* splitStreamFrames(frames: StreamFrame[], maximum: number): Generator<StreamFrame> {
  const payload = maximum - STREAM_HEADER_BYTES;
  if (payload <= 0) throw new Error('Stream path limit too small');
  for (const frame of frames) {
    if (frame.type !== 'data') { yield frame; continue; }
    for (let offset = 0; offset < frame.data.length; offset += payload) {
      yield { type: 'data', offset: frame.offset + offset, data: frame.data.subarray(offset, offset + payload) };
    }
  }
}
