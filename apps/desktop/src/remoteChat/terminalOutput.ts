import type { TerminalEvent, TerminalRead } from '../../../../shared/terminal/types';

const MAX_OUTPUT_BYTES = 512 * 1024;
const MAX_READ_BYTES = 32 * 1024;
const MAX_EVENTS = 2048;
interface Entry { sequence: number; event: TerminalEvent; bytes: number }

/** Readers keep their own cursor; disconnects never consume another reader's output. */
export class TerminalOutput {
  private readonly entries: Entry[] = [];
  private sequence = 0;
  private bytes = 0;
  private delivered = 0;
  coalesceOutput = false;

  get cursor() { return this.sequence; }

  acknowledgedBytes(from: number, to: number) {
    return this.entries.reduce((total, entry) =>
      total + (entry.sequence > from && entry.sequence <= to ? entry.bytes : 0), 0);
  }

  push(event: TerminalEvent) {
    if (event.type !== 'output') { this.append(event, 0); return; }
    for (let offset = 0; offset < event.data.length; offset += MAX_READ_BYTES) {
      const data = event.data.slice(offset, offset + MAX_READ_BYTES);
      this.append({ type: 'output', data }, data.length);
    }
  }

  private append(event: TerminalEvent, bytes: number) {
    const previous = this.entries.at(-1);
    if (this.coalesceOutput && event.type === 'output' && previous?.event.type === 'output'
      && previous.sequence > this.delivered && previous.bytes + bytes <= MAX_READ_BYTES) {
      previous.event.data.push(...event.data); previous.bytes += bytes;
    } else this.entries.push({ sequence: ++this.sequence, event, bytes });
    this.bytes += bytes;
    while (this.bytes > MAX_OUTPUT_BYTES || this.entries.length > MAX_EVENTS) {
      this.bytes -= this.entries.shift()!.bytes;
    }
  }

  read(cursor: number): TerminalRead {
    const first = this.entries[0]?.sequence ?? this.sequence + 1;
    const truncated = cursor < first - 1;
    const events: TerminalEvent[] = [];
    let next = Math.max(cursor, first - 1);
    let bytes = 0;
    for (const entry of this.entries) {
      if (entry.sequence <= cursor) continue;
      events.push(entry.event); next = entry.sequence; bytes += entry.bytes;
      if (bytes >= MAX_READ_BYTES) break;
    }
    this.delivered = Math.max(this.delivered, next);
    return { found: true, events, cursor: next, truncated };
  }
}
