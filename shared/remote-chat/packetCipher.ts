/** Optional platform implementation of the existing ChaCha20-Poly1305 wire format. */
export interface PacketCipher {
  encrypt(text: string, nonceHex: string): string;
  decrypt(payload: string): string;
  encryptBytes?(bytes: Uint8Array, nonceHex: string): string;
  decryptBytes?(payload: string): Uint8Array;
  /** One native worker call owns UTF-8, bounded DEFLATE and AEAD. The nonce starts with flag 0. */
  encryptWithCompression?(text: string, nonceHex: string): Promise<string>;
  decryptWithDecompression?(payload: string): Promise<string>;
  destroy(): void;
}

/** The implementation must copy key material; the caller retains and clears its buffers. */
export type PacketCipherFactory = (material: {
  key: Uint8Array; context: Uint8Array;
}) => PacketCipher | undefined;
