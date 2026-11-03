import { decodeRelay, encodeRelay } from '../relayWire';
import { decodeBulkRelay, encodeBulkRelay, isBulkRelay } from '../bulkRelayWire';
import { BULK_LIMITS } from '../bulkLimits';

/** A signalling socket can be owned by the browser or by a native credential broker. */
export interface ChatSocket {
  readonly bulkAvailable?: boolean;
  onbulk?: ((sessionId: string, bytes: Uint8Array) => void) | null;
  readonly readyState: number;
  readonly bufferedAmount: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  sendBulk?(sessionId: string, records: readonly Uint8Array[]): Promise<void>;
  close(): void;
}

export function browserChatSocket(url: string): ChatSocket {
  const socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  let binaryRelay = false;
  let bulkAvailable = false;
  const bridge: ChatSocket = {
    get readyState() { return socket.readyState; },
    get bufferedAmount() { return socket.bufferedAmount; },
    get bulkAvailable() { return bulkAvailable; },
    onbulk: null,
    onopen: null, onmessage: null, onclose: null, onerror: null,
    send: (data) => socket.send(binaryRelay ? encodeRelay(data) : data), close: () => socket.close(),
    sendBulk: (sessionId, records) => sendBulk(socket, sessionId, records, bulkAvailable),
  };
  socket.onopen = () => bridge.onopen?.();
  socket.onmessage = (event) => {
    try {
      if (event.data instanceof ArrayBuffer && isBulkRelay(event.data)) {
        if (!bulkAvailable) throw new Error('Bulk not negotiated');
        const { sessionId, record } = decodeBulkRelay(event.data);
        bridge.onbulk?.(sessionId, record); return;
      }
      const data = event.data instanceof ArrayBuffer ? decodeRelay(event.data) : event.data;
      if (typeof data !== 'string') throw new Error('Invalid frame');
      if (supportsBinary(data)) binaryRelay = true;
      if (supportsBulk(data)) bulkAvailable = true;
      bridge.onmessage?.({ data });
    } catch { socket.close(); bridge.onerror?.(); }
  };
  socket.onclose = (event) => bridge.onclose?.(event);
  socket.onerror = () => bridge.onerror?.();
  return bridge;
}

const SOCKET_DRAIN_MS = 4;
const SOCKET_STALL_MS = 30_000;
async function sendBulk(socket: WebSocket, sessionId: string, records: readonly Uint8Array[], enabled: boolean) {
  if (!enabled || !records.length || records.length > BULK_LIMITS.sendBatchRecords) throw new Error('Bulk unavailable');
  const started = Date.now();
  for (const record of records) {
    const bytes = encodeBulkRelay(sessionId, record);
    while (socket.bufferedAmount + bytes.length > BULK_LIMITS.transportHighBytes) {
      if (socket.readyState !== WebSocket.OPEN || Date.now() - started > SOCKET_STALL_MS) {
        throw new Error('Bulk connection stalled');
      }
      await new Promise(resolve => setTimeout(resolve, SOCKET_DRAIN_MS));
    }
    if (socket.readyState !== WebSocket.OPEN) throw new Error('Bulk connection closed');
    socket.send(bytes);
  }
}

function supportsBinary(data: string) {
  try {
    const frame = JSON.parse(data) as Record<string, unknown> | null;
    return frame?.type === 'chat-policy' && frame.binaryRelay === true;
  } catch { return false; } // The connection validates text frames and reports its existing protocol error.
}

function supportsBulk(data: string) {
  try {
    const frame = JSON.parse(data) as { type?: string; fileBulkV1?: boolean } | null;
    return frame?.type === 'chat-policy' && frame.fileBulkV1 === true;
  } catch { return false; }
}
