const ACK_BATCH_SIZE = 8;
const ACK_DELAY_MS = 8;

/** A cumulative acknowledgement covers a short burst without sending a reverse packet for every fragment. */
export class Acknowledgements {
  private pending?: { frame: object; send: (frame: object) => void };
  private count = 0;
  private timer?: ReturnType<typeof setTimeout>;

  schedule(frame: object, send: (frame: object) => void) {
    this.pending = { frame, send };
    this.count += 1;
    if (this.count >= ACK_BATCH_SIZE) { this.flush(); return; }
    this.timer ??= setTimeout(() => this.flush(), ACK_DELAY_MS);
  }

  private flush() {
    const pending = this.pending;
    this.clear();
    pending?.send(pending.frame);
  }

  clear() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
    this.count = 0;
  }
}
