const LIST_REFRESH_DELAY_MS = 150;

interface ListRequest { key: string; scope: string; more?: boolean; fresh?: boolean }
type LoadList = (generation: number, revision: number) => Promise<void>;
interface PendingList extends ListRequest { promise: Promise<void>; followup?: Promise<void> }

/** Serialize refreshes while keeping notifications newer than the requested snapshot. */
export class ThreadListRequests {
  generation = 0;
  private revision = 0;
  private pending?: PendingList;
  private timer?: ReturnType<typeof setTimeout>;
  private dirty = false;

  constructor(private readonly refresh: () => Promise<void>) {}

  run(options: ListRequest, load: LoadList): Promise<void> {
    if (options.fresh && this.pending?.scope === options.scope) return this.queueFresh(options, load);
    if (this.pending?.key === options.key) return this.pending.promise;
    clearTimeout(this.timer);
    this.timer = undefined;
    // Loading an older page cannot satisfy a notification about the first page.
    if (!options.more) this.dirty = false;
    const generation = ++this.generation;
    const pending: PendingList = { ...options, promise: Promise.resolve() };
    this.pending = pending;
    pending.promise = load(generation, this.revision).finally(() => {
      if (this.pending !== pending) return;
      this.pending = undefined;
      if (this.dirty) this.schedule();
    });
    return pending.promise;
  }

  private queueFresh(options: ListRequest, load: LoadList): Promise<void> {
    const pending = this.pending!;
    if (pending.followup) return pending.followup;
    const generation = this.generation;
    this.revision += 1;
    pending.followup = pending.promise.then(() => {
      if (generation === this.generation) return this.run({ ...options, fresh: false }, load);
    });
    return pending.followup;
  }

  accepts(generation: number, revision: number) {
    return generation === this.generation && revision === this.revision;
  }

  changed() {
    this.dirty = true;
    this.schedule();
  }

  private schedule() {
    if (this.pending || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.refresh();
    }, LIST_REFRESH_DELAY_MS);
  }

  reset() {
    this.generation += 1;
    this.pending = undefined;
    this.dirty = false;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
