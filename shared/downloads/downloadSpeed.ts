const WINDOW_MS = 2_000;
const SECOND_MS = 1_000;

interface Sample { at: number; bytes: number }

/** Counts newly stored bytes in the last two seconds, excluding any resumed offset. */
export class DownloadSpeed {
  private readonly samples: Sample[] = [];
  private recentBytes = 0;

  constructor(private received: number, private readonly startedAt: number) {}

  sample(received: number, now: number): number {
    const bytes = Math.max(0, received - this.received);
    this.received = received;
    if (bytes > 0) {
      const last = this.samples.at(-1);
      if (last?.at === now) last.bytes += bytes;
      else this.samples.push({ at: now, bytes });
      this.recentBytes += bytes;
    }
    while (this.samples.length && this.samples[0].at <= now - WINDOW_MS) {
      this.recentBytes -= this.samples.shift()!.bytes;
    }
    const elapsed = Math.min(WINDOW_MS, now - this.startedAt);
    return elapsed > 0 ? this.recentBytes * SECOND_MS / elapsed : 0;
  }
}
