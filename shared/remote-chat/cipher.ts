import { x25519 } from '@noble/curves/ed25519';
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { decodeChatUtf8 } from './utf8';
import type { PacketCipher, PacketCipherFactory } from './packetCipher';
import { BulkCipher, type BulkCipherContext } from './bulkCipher';
import { MAX_PACKET_PLAIN_BYTES } from './packetCompression';

const REPLAY_WINDOW = 1024;

export function keyPair(random: (length: number) => Uint8Array) {
  const secret = random(32);
  return { secret, publicKey: bytesToHex(x25519.getPublicKey(secret)) };
}

/** Separate nonce namespaces per direction; authenticated session binding and replay rejection. */
export class SessionCipher {
  private readonly key: Uint8Array;
  private readonly bulkKey: Uint8Array;
  private readonly bulkIdentity: Pick<BulkCipherContext, 'sessionId' | 'desktopKey' | 'clientKey' | 'desktop'>;
  private readonly context: Uint8Array;
  private readonly packetCipher?: PacketCipher;
  private destroyed = false;
  private sequence = 0;
  private highestReceived = 0;
  private readonly received = new Uint32Array(REPLAY_WINDOW);
  private readonly opening = new Set<number>();
  private readonly bulkEpochs = new Set<string>();

  constructor(options: {
    secret: Uint8Array; publicKey: string; sessionId: string; desktop: boolean;
    createPacketCipher?: PacketCipherFactory;
  }) {
    const shared = x25519.getSharedSecret(options.secret, hexToBytes(options.publicKey));
    this.context = utf8ToBytes(`codex-switch-chat-v1:${options.sessionId}`);
    this.key = hkdf(sha256, shared, this.context, 'chat encryption', 32);
    this.bulkKey = hkdf(sha256, this.key, this.context, 'file bulk root v1', 32);
    const localKey = bytesToHex(x25519.getPublicKey(options.secret));
    this.bulkIdentity = { sessionId: options.sessionId, desktop: options.desktop,
      desktopKey: options.desktop ? localKey : options.publicKey,
      clientKey: options.desktop ? options.publicKey : localKey };
    shared.fill(0);
    this.direction = options.desktop ? 1 : 2;
    try {
      this.packetCipher = options.createPacketCipher?.({ key: this.key, context: this.context });
    } catch (error) { this.key.fill(0); this.bulkKey.fill(0); throw error; }
    if (this.packetCipher) this.key.fill(0);
  }

  private readonly direction: number;

  createBulkCipher(context: Pick<BulkCipherContext, 'transferId' | 'manifestId' | 'epoch'>) {
    if (this.destroyed) throw new Error('Session closed');
    if (this.bulkEpochs.has(context.epoch) || this.bulkEpochs.size >= 1024) throw new Error('File epoch already used');
    this.bulkEpochs.add(context.epoch);
    return new BulkCipher(this.bulkKey, { ...this.bulkIdentity, ...context });
  }

  get supportsBinaryPlaintext() {
    return !this.packetCipher || Boolean(this.packetCipher.encryptBytes && this.packetCipher.decryptBytes);
  }

  get supportsIntegratedCompression() {
    return Boolean(this.packetCipher?.encryptWithCompression && this.packetCipher.decryptWithDecompression);
  }

  async encryptWithCompression(text: string): Promise<string> {
    if (!this.supportsIntegratedCompression) throw new Error('Native packet codec unavailable');
    const payload = await this.packetCipher!.encryptWithCompression!(text, bytesToHex(this.nonce(false)));
    if (this.destroyed) throw new Error('Session closed');
    return payload;
  }

  async decryptWithDecompression(payload: string): Promise<string | null> {
    if (!this.supportsIntegratedCompression) throw new Error('Native packet codec unavailable');
    const { sequence } = this.packet(payload, true);
    if (this.replayed(sequence) || this.opening.has(sequence)) return null;
    this.opening.add(sequence);
    try {
      const text = await this.packetCipher!.decryptWithDecompression!(payload);
      if (this.destroyed) throw new Error('Session closed');
      // Other native workers and synchronous controls can advance the window while this call is pending.
      if (this.replayed(sequence)) return null;
      this.remember(sequence);
      return text;
    } finally { this.opening.delete(sequence); }
  }

  private nonce(compressed: boolean) {
    if (this.destroyed) throw new Error('Session closed');
    this.sequence += 1;
    if (this.sequence > 0xffffffff) throw new Error('请重新连接电脑。');
    const nonce = new Uint8Array(12);
    const view = new DataView(nonce.buffer);
    view.setUint32(0, this.direction);
    // This nonce field is authenticated by AEAD. 0 preserves the legacy wire format; 1 is DEFLATE v1.
    view.setUint32(4, compressed ? 1 : 0);
    view.setUint32(8, this.sequence);
    return nonce;
  }

  encrypt(text: string) {
    const nonce = this.nonce(false);
    if (this.packetCipher) return this.packetCipher.encrypt(text, bytesToHex(nonce));
    return this.seal(utf8ToBytes(text), nonce);
  }

  encryptCompressed(bytes: Uint8Array) {
    if (!this.supportsBinaryPlaintext) throw new Error('Binary packets unavailable');
    const nonce = this.nonce(true);
    if (this.packetCipher?.encryptBytes) return this.packetCipher.encryptBytes(bytes, bytesToHex(nonce));
    return this.seal(bytes, nonce);
  }

  private seal(bytes: Uint8Array, nonce: Uint8Array) {
    if (bytes.length > MAX_PACKET_PLAIN_BYTES) throw new Error('Invalid packet');
    const encrypted = chacha20poly1305(this.key, nonce, this.context).encrypt(bytes);
    return bytesToHex(nonce) + bytesToHex(encrypted);
  }

  decrypt(payload: string): string | null {
    const plain = this.open(payload, false);
    return plain === null || typeof plain === 'string' ? plain : decodeChatUtf8(plain);
  }

  decryptCompressed(payload: string): Uint8Array | null {
    if (!this.supportsBinaryPlaintext) throw new Error('Binary packets unavailable');
    const plain = this.open(payload, true);
    if (typeof plain === 'string') throw new Error('Invalid binary packet');
    return plain;
  }

  private packet(payload: string, compressed: boolean) {
    if (this.destroyed) throw new Error('Session closed');
    if (payload.length > 40_000 || payload.length < 56 || payload.length % 2 !== 0) throw new Error('Invalid packet');
    // Native codecs validate and decode the ciphertext. Hermes only needs the fixed-size nonce for replay checks.
    const encoded = this.packetCipher ? payload.slice(0, 24) : payload;
    if (!/^[a-f0-9]+$/.test(encoded)) throw new Error('Invalid packet');
    const bytes = hexToBytes(encoded);
    const nonce = bytes.subarray(0, 12);
    const view = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
    const sequence = view.getUint32(8);
    if (view.getUint32(0) !== (this.direction === 1 ? 2 : 1)
      || view.getUint32(4) !== (compressed ? 1 : 0) || sequence === 0) {
      throw new Error('Invalid nonce');
    }
    return { bytes, nonce, sequence };
  }

  private replayed(sequence: number) {
    return this.received[sequence % REPLAY_WINDOW] === sequence || sequence <= this.highestReceived - REPLAY_WINDOW;
  }

  private remember(sequence: number) {
    this.received[sequence % REPLAY_WINDOW] = sequence;
    this.highestReceived = Math.max(this.highestReceived, sequence);
  }

  private open(payload: string, compressed: boolean): string | Uint8Array | null {
    const { bytes, nonce, sequence } = this.packet(payload, compressed);
    if (this.replayed(sequence)) return null;
    const plain = this.packetCipher ? this.openNative(payload, compressed)
      : chacha20poly1305(this.key, nonce, this.context).decrypt(bytes.subarray(12));
    // Only authenticated packets enter the ring. Sequences sharing a slot cannot both be inside the replay window.
    this.remember(sequence);
    return plain;
  }

  private openNative(payload: string, compressed: boolean) {
    if (compressed && this.packetCipher?.decryptBytes) return this.packetCipher.decryptBytes(payload);
    return this.packetCipher!.decrypt(payload);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.key.fill(0);
    this.bulkKey.fill(0);
    this.received.fill(0);
    this.opening.clear();
    this.bulkEpochs.clear();
    this.packetCipher?.destroy();
  }
}
