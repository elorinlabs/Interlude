import { MAX_FRAME_BYTES } from './types';

const WINDOW_MS = 10_000;
const MESSAGE_LIMIT = 20;
const RECEIPT_LIMIT = 120;
const BYTE_BUDGET = MAX_FRAME_BYTES * 1.5;

/** Leave headroom for authentication, presence and keepalives when several local jobs become due together. */
export class LoungeDeliveryTransport {
  private sent: { at: number; bytes: number; message: boolean }[] = [];

  send(socket: WebSocket | undefined, frame: Record<string, unknown>) {
    if (!socket || socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > MAX_FRAME_BYTES) return false;
    const data = JSON.stringify(frame);
    const now = Date.now();
    this.sent = this.sent.filter(item => now - item.at < WINDOW_MS);
    const message = frame.type === 'message';
    const count = this.sent.filter(item => item.message === message).length;
    if (count >= (message ? MESSAGE_LIMIT : RECEIPT_LIMIT)
      || this.sent.reduce((sum, item) => sum + item.bytes, 0) + data.length > BYTE_BUDGET) return false;
    try { socket.send(data); }
    catch { return false; }
    this.sent.push({ at: now, bytes: data.length, message });
    return true;
  }
}
