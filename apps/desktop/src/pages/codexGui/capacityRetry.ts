import { isModelCapacityError } from "./requestError";
import { SECOND_MS } from "./turnTiming";
import type { GuiEvent, GuiState } from "./types";

export interface CapacityRetryState {
  threadId: string;
  turnId: string;
  seconds: number;
}

interface RetryHost {
  getSnapshot: () => GuiState;
  patch: (patch: Partial<GuiState>) => void;
  send: (threadId: string, canSend: () => boolean) => Promise<boolean>;
}

interface RetryEntry {
  attempts: number;
  deadline: number;
  dispatching: boolean;
  countdown?: CapacityRetryState;
}

const FIRST_RETRY_SECONDS = 1;
const RETRY_INCREMENT_SECONDS = 2;

/** Only live terminal failures can start a retry; reading history must never send a message. */
export class CapacityRetry {
  private timer?: ReturnType<typeof setTimeout>;
  private entries = new Map<string, RetryEntry>();
  private lastCompleted = new Map<string, string>();

  constructor(private host: RetryHost) {}

  retainedThreads(): Iterable<string> { return this.entries.keys(); }

  cancel = (threadId = this.host.getSnapshot().selected) => {
    if (threadId) this.entries.delete(threadId);
    this.publish();
    this.schedule();
  };

  cancelAll() {
    this.entries.clear();
    this.publish();
    this.schedule();
  }

  stop(threadId = this.host.getSnapshot().selected) {
    const state = this.host.getSnapshot();
    const turnId = threadId ? state.conversations[threadId]?.activeTurn : null;
    if (threadId && turnId) this.lastCompleted.set(threadId, turnId);
    this.cancel(threadId);
  }

  private unavailable(state: GuiState, threadId: string) {
    return state.connection !== "ready" || !state.conversations[threadId] || state.workspaceBusy
      || state.deleting === threadId || state.compacting === threadId || Boolean(state.queued[threadId]?.length);
  }

  sync(previous: GuiState, next: GuiState) {
    for (const [threadId, entry] of this.entries) {
      const activeTurn = next.conversations[threadId]?.activeTurn;
      const manualSend = !previous.sending && next.sending
        && (next.pendingRequest?.threadId ?? next.selected) === threadId;
      const otherTurn = activeTurn && activeTurn !== previous.conversations[threadId]?.activeTurn;
      if (this.unavailable(next, threadId) || (!entry.dispatching && (manualSend || otherTurn))) {
        this.entries.delete(threadId);
      }
    }
    this.publish();
    if (!this.entries.size) this.schedule();
  }

  receive(event: GuiEvent) {
    if (event.method === "thread/archived" && event.params.threadId) this.stop(event.params.threadId);
    if (event.method !== "turn/completed") return;
    const { threadId, turn: incoming } = event.params;
    const state = this.host.getSnapshot();
    if (!threadId || !incoming) return;
    const current = state.conversations[threadId];
    const turn = current?.turns.at(-1);
    if (!turn || turn.status === "inProgress" || turn.id !== incoming.id
      || incoming.id === this.lastCompleted.get(threadId)) return;
    this.lastCompleted.set(threadId, incoming.id);
    if (turn.status !== "failed" || !isModelCapacityError(turn.error)
      || current.activeTurn || this.unavailable(state, threadId)) {
      this.cancel(threadId);
      return;
    }
    const entry = this.entries.get(threadId) ?? { attempts: 0, deadline: 0, dispatching: false };
    const seconds = FIRST_RETRY_SECONDS + RETRY_INCREMENT_SECONDS * entry.attempts++;
    entry.deadline = Date.now() + seconds * SECOND_MS;
    entry.countdown = { threadId, turnId: turn.id, seconds };
    this.entries.set(threadId, entry);
    this.publish();
    this.schedule();
  }

  private publish() {
    const state = this.host.getSnapshot();
    const capacityRetry = state.selected ? this.entries.get(state.selected)?.countdown : undefined;
    if (state.capacityRetry !== capacityRetry) this.host.patch({ capacityRetry });
  }

  private schedule() {
    if ([...this.entries.values()].some(entry => entry.countdown)) {
      this.timer ??= setTimeout(this.tick, SECOND_MS);
      return;
    }
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private tick = () => {
    this.timer = undefined;
    for (const [threadId, entry] of this.entries) {
      if (!entry.countdown) continue;
      const seconds = Math.max(0, Math.ceil((entry.deadline - Date.now()) / SECOND_MS));
      if (seconds !== entry.countdown.seconds) entry.countdown = { ...entry.countdown, seconds };
      const state = this.host.getSnapshot();
      if (!seconds && !state.sending && !state.modelCatalogLoading && !entry.dispatching) {
        void this.retry(threadId, entry);
      }
    }
    this.publish();
    this.schedule();
  };

  private async retry(threadId: string, entry: RetryEntry) {
    entry.dispatching = true;
    entry.countdown = undefined;
    this.publish();
    const canSend = () => this.entries.get(threadId) === entry
      && !this.unavailable(this.host.getSnapshot(), threadId)
      && !this.host.getSnapshot().conversations[threadId]?.activeTurn;
    try {
      if (!await this.host.send(threadId, canSend) && this.entries.get(threadId) === entry) this.cancel(threadId);
    } finally { entry.dispatching = false; }
  }
}
