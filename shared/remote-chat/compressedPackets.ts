import { utf8ToBytes } from '@noble/hashes/utils';
import type { SessionCipher } from './cipher';
import { decodeChatUtf8 } from './utf8';
import { compressedPacket, compressedPacketBody, MAX_PACKET_PLAIN_BYTES, MIN_COMPRESSION_BYTES,
  type PacketCompression } from './packetCompression';

const MAX_PENDING_PACKETS = 64;

/** Count only sub-threshold strings; this allocates no byte buffer and never scans a large fragment in JS. */
function shortText(text: string) {
  let length = text.length;
  if (length >= MIN_COMPRESSION_BYTES) return false;
  if (length * 3 < MIN_COMPRESSION_BYTES) return true;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) continue;
    length += code < 0x800 ? 1 : 2;
    // A surrogate pair occupies two UTF-16 units and four UTF-8 bytes; unpaired units become U+FFFD.
    if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(index + 1) >= 0xdc00
      && text.charCodeAt(index + 1) <= 0xdfff) index++;
    if (length >= MIN_COMPRESSION_BYTES) return false;
  }
  return true;
}

/** Async native work is bounded independently of delivery windows; control frames never wait behind it. */
export class CompressedPackets {
  private readonly sending = new Set<string>();
  private receiving = 0;
  private closed = false;

  constructor(private readonly codec: PacketCompression, private readonly cipher: SessionCipher,
    private readonly failed: () => void, private readonly drained: () => void = () => {}) {}

  get bufferedAmount() { return this.sending.size * MAX_PACKET_PLAIN_BYTES; }

  send(key: string, text: string, write: (payload: string) => void): boolean {
    if (this.closed) return false;
    if (this.sending.has(key)) return true;
    if (this.sending.size >= MAX_PENDING_PACKETS) return false;
    if (this.cipher.supportsIntegratedCompression) {
      // Avoid a worker round trip for provably short text without encoding it in Hermes.
      if (shortText(text)) {
        write(this.cipher.encrypt(text)); return true;
      }
      return this.enqueue(key, this.cipher.encryptWithCompression(text), write);
    }
    const bytes = utf8ToBytes(text);
    if (bytes.length > MAX_PACKET_PLAIN_BYTES) throw new Error('Invalid packet');
    if (bytes.length < MIN_COMPRESSION_BYTES) { write(this.cipher.encrypt(text)); return true; }
    return this.enqueue(key, this.codec.compress(bytes).then(compressed => {
      if (this.closed) throw new Error('Packet codec closed');
      const packet = compressedPacket(bytes, compressed);
      return packet ? this.cipher.encryptCompressed(packet) : this.cipher.encrypt(text);
    }), write);
  }

  private enqueue(key: string, pending: Promise<string>, write: (payload: string) => void) {
    this.sending.add(key);
    void pending.then(payload => { if (!this.closed) write(payload); })
      .catch(() => { if (!this.closed) this.failed(); }).finally(() => {
      this.sending.delete(key);
      if (!this.closed) this.drained();
    });
    return true;
  }

  receive(payload: string, accept: (text: string) => void) {
    if (this.closed) return;
    // Both delivery lanes and retry paths can burst together. Leave overflow unacknowledged
    // so delivery retries it after native capacity returns, without growing the work queue.
    if (this.receiving >= MAX_PENDING_PACKETS) return;
    if (this.cipher.supportsIntegratedCompression) {
      this.deliver(this.cipher.decryptWithDecompression(payload), accept);
      return;
    }
    // Authenticate and reject replays before allocating the bounded decompression output.
    const packet = this.cipher.decryptCompressed(payload);
    if (packet === null) return;
    const { bytes, length } = compressedPacketBody(packet);
    this.deliver(this.codec.decompress(bytes, length).then(plain => {
      if (plain.length !== length) throw new Error('Invalid decompressed length');
      return decodeChatUtf8(plain);
    }), accept);
  }

  private deliver(pending: Promise<string | null>, accept: (text: string) => void) {
    this.receiving++;
    void pending.then(text => {
      if (!this.closed && text !== null) accept(text);
    }).catch(() => { if (!this.closed) this.failed(); }).finally(() => { this.receiving--; });
  }

  close() { this.closed = true; this.sending.clear(); this.codec.close(); }
}

/** This is routing only; SessionCipher authenticates the nonce before accepting the flag. */
export function isCompressedPacket(payload: string) { return payload.slice(8, 16) === '00000001'; }
