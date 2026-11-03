import { terminalApi } from '../pages/codexGui/terminal/api';
import type { TerminalOutput } from './terminalOutput';

const CREDIT_BYTES = 64 * 1024;
const LEASE_MS = 30_000;

/** A transfer owns one delivery lease. Cursor acknowledgements never consume another reader's history. */
export class TerminalFlow {
  private token?: string;
  private cursor = 0;
  private delivered = 0;
  private expiry = 0;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly id: string, private readonly output: TerminalOutput) {}

  mode(token: unknown, enabled: unknown) {
    if (typeof token !== 'string' || !token || token.length > 100 || typeof enabled !== 'boolean') {
      throw new Error('client.ssh.invalid');
    }
    if (!enabled && this.token !== token) return Promise.resolve();
    if (enabled && this.token && this.token !== token && Date.now() < this.expiry) {
      throw new Error('client.ssh.conflict');
    }
    if (enabled && this.token === token) return this.pending;
    this.token = enabled ? token : undefined;
    this.output.coalesceOutput = enabled;
    this.cursor = this.delivered = this.output.cursor;
    this.expiry = Date.now() + LEASE_MS;
    return this.enqueue(() => terminalApi.outputFlow(this.id, enabled));
  }

  async read(cursor: number, token: unknown) {
    if (!this.token || token !== this.token) return;
    // The next request acknowledges only output already delivered to a viewer.
    const acknowledged = Math.max(this.cursor, Math.min(cursor, this.delivered));
    let bytes = this.output.acknowledgedBytes(this.cursor, acknowledged);
    this.cursor = acknowledged;
    this.expiry = Date.now() + LEASE_MS;
    await this.enqueue(async () => {
      do {
        const chunk = Math.min(bytes, CREDIT_BYTES);
        await terminalApi.outputAck(this.id, chunk);
        bytes -= chunk;
      } while (bytes > 0);
    });
  }

  deliveredThrough(cursor: number) { this.delivered = Math.max(this.delivered, cursor); }

  private enqueue(operation: () => Promise<void>) {
    const result = this.pending.then(operation);
    // Keep cleanup commands usable if a previous IPC request failed.
    this.pending = result.catch(() => undefined);
    return result;
  }
}
