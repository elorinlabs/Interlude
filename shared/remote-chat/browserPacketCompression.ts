import type { PacketCompression, PacketCompressionFactory } from './packetCompression';

const TIMEOUT_MS = 15_000;
const MAX_PENDING = 128;
interface Pending { resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> }

class BrowserPacketCompression implements PacketCompression {
  private readonly worker = new Worker(new URL('./packetCompression.worker.ts', import.meta.url), { type: 'module' });
  private readonly pending = new Map<number, Pending>();
  private serial = 0;
  private closed = false;

  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<{ id: number; bytes?: Uint8Array; error?: boolean }>) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(data.id);
      if (data.error || !(data.bytes instanceof Uint8Array)) pending.reject(new Error('Packet codec failed'));
      else pending.resolve(data.bytes);
    };
    this.worker.onerror = () => this.close();
    this.worker.onmessageerror = () => this.close();
  }

  compress(bytes: Uint8Array) { return this.transform({ action: 'compress', bytes }); }
  decompress(bytes: Uint8Array, length: number) { return this.transform({ action: 'decompress', bytes, length }); }

  private transform(request: { action: 'compress' | 'decompress'; bytes: Uint8Array; length?: number }) {
    if (this.closed || this.pending.size >= MAX_PENDING) return Promise.reject(new Error('Packet codec unavailable'));
    const id = ++this.serial;
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => this.close(), TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      // Compression input remains available for the size comparison and uncompressed fallback.
      try { this.worker.postMessage({ ...request, id }); }
      catch { this.close(); }
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true; this.worker.terminate();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer); pending.reject(new Error('Packet codec closed'));
    }
    this.pending.clear();
  }
}

/** Older WebViews retain uncompressed packets until their native raw-DEFLATE APIs are available. */
export const createBrowserPacketCompression: PacketCompressionFactory = () => {
  try {
    if (typeof Worker === 'undefined') return undefined;
    new CompressionStream('deflate-raw'); new DecompressionStream('deflate-raw');
    return new BrowserPacketCompression();
  } catch { return undefined; }
};
