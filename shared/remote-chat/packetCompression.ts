/** Implementations run DEFLATE in native workers, never in JavaScript. */
export interface PacketCompression {
  compress(bytes: Uint8Array): Promise<Uint8Array>;
  decompress(bytes: Uint8Array, length: number): Promise<Uint8Array>;
  close(): void;
}
export type PacketCompressionFactory = () => PacketCompression | undefined;
export const PACKET_COMPRESSION = 'deflate-raw-v1';
export const MAX_PACKET_PLAIN_BYTES = 20_000 - 12 - 16;
export const MIN_COMPRESSION_BYTES = 256;
const LENGTH_BYTES = 2;
const MIN_SAVING_BYTES = 32;
const MIN_SAVING_FRACTION = 0.1;

/** The original length is encrypted along with the independent raw DEFLATE stream. */
export function compressedPacket(original: Uint8Array, compressed: Uint8Array): Uint8Array | undefined {
  const size = LENGTH_BYTES + compressed.length;
  const saving = original.length - size;
  if (saving < MIN_SAVING_BYTES || saving < original.length * MIN_SAVING_FRACTION) return;
  const packet = new Uint8Array(size);
  new DataView(packet.buffer).setUint16(0, original.length);
  packet.set(compressed, LENGTH_BYTES);
  return packet;
}

export function compressedPacketBody(packet: Uint8Array) {
  if (packet.length <= LENGTH_BYTES) throw new Error('Invalid compressed packet');
  const length = new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint16(0);
  if (length < MIN_COMPRESSION_BYTES || length > MAX_PACKET_PLAIN_BYTES) {
    throw new Error('Invalid compressed packet length');
  }
  return { length, bytes: packet.subarray(LENGTH_BYTES) };
}
