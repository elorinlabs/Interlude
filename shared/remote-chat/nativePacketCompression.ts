import { fromByteArray, toByteArray } from 'base64-js';
import type { PacketCompression } from './packetCompression';

export type PacketCodecRequest = { action: 'compress'; data: string }
  | { action: 'decompress'; data: string; length: number };

/** Only IPC encoding occurs in JS. Rust owns the bounded DEFLATE work on native workers. */
export function nativePacketCompression(call: (request: PacketCodecRequest) => Promise<string>): PacketCompression {
  let closed = false;
  const transform = async (request: PacketCodecRequest) => {
    if (closed) throw new Error('Packet codec closed');
    const result = await call(request);
    if (closed) throw new Error('Packet codec closed');
    return toByteArray(result);
  };
  return {
    compress: bytes => transform({ action: 'compress', data: fromByteArray(bytes) }),
    decompress: (bytes, length) => transform({ action: 'decompress', data: fromByteArray(bytes), length }),
    close: () => { closed = true; },
  };
}
