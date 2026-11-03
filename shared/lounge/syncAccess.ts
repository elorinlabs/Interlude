/** Correlates current deletion generations with the authenticated coordinator, independently of presence watches. */
export class HistoryAccess {
  private sequence = 0;
  private pending = new Map<string, { peers: string[]; resolve: (value: Record<string, number>) => void;
    reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(private readonly send: (frame: object) => void) {}

  generations = (peers: string[]): Promise<Record<string, number>> => {
    if (!peers.length) return Promise.resolve({});
    if (this.pending.size >= 16 || peers.length > 50) return Promise.reject(new Error('history-access-busy'));
    const id = `history-access-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(id), 10_000);
      this.pending.set(id, { peers, resolve, reject, timer });
      try { this.send({ type: 'history-generations', id, peers }); }
      catch { this.fail(id); }
    });
  };

  receive(frame: Record<string, unknown>) {
    if (frame.type !== 'history-generations') return false;
    const id = String(frame.id);
    const pending = this.pending.get(id);
    if (!pending) return true;
    const generations = frame.generations as Record<string, unknown> | undefined;
    if (frame.error || !generations || typeof generations !== 'object'
      || pending.peers.some(peer => !Number.isSafeInteger(generations[peer]) || Number(generations[peer]) < 0)) {
      this.fail(id); return true;
    }
    this.pending.delete(id); clearTimeout(pending.timer);
    pending.resolve(Object.fromEntries(pending.peers.map(peer => [peer, Number(generations[peer])])));
    return true;
  }

  private fail(id: string) {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id); clearTimeout(pending.timer); pending.reject(new Error('history-access-unavailable'));
  }

  close() { for (const id of this.pending.keys()) this.fail(id); }
}
