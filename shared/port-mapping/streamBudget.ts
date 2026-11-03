const MAX_ACTIVE_STREAMS = 8;
const MAX_WAITING_STREAMS = 128;
const WAIT_TIMEOUT_MS = 30_000;
type Release = () => void;

/** FIFO admission shared by one computer's mappings, leaving RPC capacity for chat and stream cleanup. */
export class StreamBudget {
  private used = 0;
  private readonly waiting = new Set<(available: boolean) => void>();
  private readonly cancellations = new Map<AbortSignal, { jobs: Set<() => void>; abort: () => void }>();

  constructor(readonly limit = MAX_ACTIVE_STREAMS) {}

  get active() { return this.used; }

  acquire(signal: AbortSignal): Promise<Release | undefined> {
    if (signal.aborted) return Promise.resolve(undefined);
    if (this.used < this.limit) return Promise.resolve(this.reserve());
    if (this.waiting.size >= MAX_WAITING_STREAMS) return Promise.resolve(undefined);
    return new Promise(resolve => {
      const finish = (available: boolean) => {
        clearTimeout(timer);
        this.unsubscribe(signal, cancel);
        this.waiting.delete(finish);
        resolve(available ? this.reserve() : undefined);
      };
      const cancel = () => finish(false);
      const timer = setTimeout(cancel, WAIT_TIMEOUT_MS);
      this.waiting.add(finish);
      this.subscribe(signal, cancel);
    });
  }

  private subscribe(signal: AbortSignal, cancel: () => void) {
    let entry = this.cancellations.get(signal);
    if (!entry) {
      const jobs = new Set<() => void>();
      const abort = () => { for (const job of [...jobs]) job(); };
      entry = { jobs, abort }; this.cancellations.set(signal, entry);
      signal.addEventListener('abort', abort, { once: true });
    }
    entry.jobs.add(cancel);
  }

  private unsubscribe(signal: AbortSignal, cancel: () => void) {
    const entry = this.cancellations.get(signal);
    if (!entry) return;
    entry.jobs.delete(cancel);
    if (!entry.jobs.size) { signal.removeEventListener('abort', entry.abort); this.cancellations.delete(signal); }
  }

  private reserve(): Release {
    this.used++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.used--;
      this.waiting.values().next().value?.(true);
    };
  }
}
