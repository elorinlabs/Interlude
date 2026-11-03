const PROGRESS_INTERVAL_MS = 250;
const KIB = 1024;
const MIB = KIB * KIB;
function size(bytes: number) {
  return bytes >= MIB ? `${(bytes / MIB).toFixed(1)} MB` : `${Math.round(bytes / KIB)} KB`;
}

/** Sample written bytes, and avoid re-rendering the download dialog for every received chunk. */
export class DownloadProgress {
  private started?: number;
  private updated = -Infinity;

  update(received: number, total: number, now = performance.now()) {
    this.started ??= now;
    if (received !== total && now - this.updated < PROGRESS_INTERVAL_MS) return;
    this.updated = now;
    const elapsed = (now - this.started) / 1000;
    const speed = elapsed > 0 ? received / elapsed : 0;
    return { percent: total ? Math.floor(received / total * 100) : 100,
      detail: `${size(received)} / ${size(total)}${speed ? ` · ${size(speed)}/s` : ''}` };
  }
}
