import { MAX_FRAME_BYTES, type LoungeAccount, type LoungeDraft, type LoungeMessage } from './types';

const SEND_TIMEOUT_MS = 20_000;
interface Pending {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  group?: { draft: LoungeDraft; sender: LoungeAccount };
}
interface Submission {
  socket: WebSocket;
  id: string;
  frame: Record<string, unknown>;
  group?: Pending['group'];
}

/** Correlate server confirmations with this connection's requests; group sends never await recipient receipts. */
export class LoungeSubmissions {
  private pending = new Map<string, Pending>();

  send({ socket, id, frame, group }: Submission): Promise<void> {
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > MAX_FRAME_BYTES) {
      return Promise.reject(new Error('client.lounge.sendFailed'));
    }
    // Retain exactly the submitted content while the user continues editing the composer.
    const saved = group && { sender: { ...group.sender }, draft: { ...group.draft,
      images: [...group.draft.images], reply: group.draft.reply && { ...group.draft.reply } } };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.finish(id, new Error('client.lounge.sendFailed')), SEND_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer, group: saved });
      try { socket.send(JSON.stringify({ id, ...frame })); }
      catch { this.finish(id, new Error('client.lounge.sendFailed')); }
    });
  }

  accepted(frame: Record<string, unknown>): LoungeMessage | undefined {
    if (frame.type !== 'accepted' || typeof frame.id !== 'string' || typeof frame.sentAt !== 'string'
      || !Number.isFinite(Date.parse(frame.sentAt))) return;
    const group = this.pending.get(frame.id)?.group;
    if (!group) return;
    return { type: 'message', id: frame.id, sender: group.sender, text: group.draft.text,
      images: group.draft.images, reply: group.draft.reply, sentAt: frame.sentAt };
  }

  has(id: string) { return this.pending.has(id); }

  finish(id: string, error?: Error) {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (error) pending.reject(error);
    else pending.resolve();
  }

  disconnect() {
    for (const id of this.pending.keys()) this.finish(id, new Error('client.lounge.sendFailed'));
  }
}
