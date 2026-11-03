const CHUNK_BYTES = 8192;
const MAX_QUEUED_BYTES = 256 * 1024;

/** Await drain between file chunks; protocol callbacks themselves are synchronous. */
export class ZmodemWriter {
  private tail = Promise.resolve();
  private pending = 0;
  private revision = 0;
  private failure?: Error;

  constructor(private readonly write: (bytes: number[]) => Promise<void>,
    private readonly onError: () => void) {}

  send(bytes: number[]) {
    if (this.failure) throw this.failure;
    if (this.pending + bytes.length > MAX_QUEUED_BYTES) throw new Error('ZMODEM queue limit');
    const revision = this.revision;
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
      const chunk = bytes.slice(offset, offset + CHUNK_BYTES);
      this.pending += chunk.length;
      this.tail = this.tail.then(async () => {
        if (revision !== this.revision || this.failure) return;
        try { await this.write(chunk); }
        catch {
          this.failure = new Error('ZMODEM write failed');
          this.onError();
        } finally { if (revision === this.revision) this.pending -= chunk.length; }
      });
    }
  }

  async drain() { await this.tail; if (this.failure) throw this.failure; }

  clear() { this.revision++; this.pending = 0; this.failure = undefined; }
}
