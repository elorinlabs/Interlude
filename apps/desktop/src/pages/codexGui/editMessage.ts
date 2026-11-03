import { uiText } from "../../i18n/uiText";
import { guiApi } from "./api";
import { conversation } from "./events";
import { lastUserMessage } from '../../../../../shared/chat/latestUserMessage';
export { lastUserMessage } from '../../../../../shared/chat/latestUserMessage';
import { editedMessageDraft } from "./editedMessageDraft";
import type { MessageEditContent } from "./messageEditContent";
import type { Conversation, GuiState, MessageInput, Thread, Turn } from "./types";

export interface MessageEdit extends MessageEditContent { threadId: string; turnId: string; itemId: string }
export type EditMessage = (edit: MessageEdit) => Promise<boolean>;
export type MessageTarget = Pick<MessageEdit, "threadId" | "turnId" | "itemId">;
export type DeleteMessage = (target: MessageTarget) => Promise<boolean>;
export interface MessageChangeResult { thread: Thread; turn?: Turn; error?: string }

export function canEditMessage(state: GuiState): boolean {
  const id = state.selected;
  return Boolean(id && state.connection === "ready" && !state.modelSettingsLoading
    && !state.archived && !state.sending && !state.deleting
    && !state.workspaceBusy
    && state.compacting !== id && !state.conversations[id]?.activeTurn && !state.queued[id]?.length
    && !state.approvals.some((event) => event.params.threadId === id));
}

interface EditHost {
  getSnapshot: () => GuiState;
  patch: (patch: Partial<GuiState>) => void;
  report: (error: unknown) => void;
  acceptTurn: (threadId: string, turn: Turn) => void;
  refresh: () => Promise<void>;
  flushQueue: () => void;
}

export class GuiMessageEditor {
  readonly recoveredDrafts = new Map<string, MessageInput>();
  constructor(private host: EditHost) {}
  remove: DeleteMessage = async (target) => {
    const state = this.host.getSnapshot();
    const before = state.conversations[target.threadId];
    const last = lastUserMessage(before);
    if (!canEditMessage(state) || state.selected !== target.threadId || last?.turnId !== target.turnId
      || last.item.id !== target.itemId || last.item.localEcho) return false;
    this.host.patch({ sending: true, error: "" });
    try {
      const result = await guiApi.request<MessageChangeResult>({ operation: "deleteMessage",
        ...target, access: state.settings.access });
      this.applyResult(before, result);
      return true;
    } catch (error) { this.host.report(error); return false; }
    finally { this.host.patch({ sending: false }); this.host.flushQueue(); }
  };

  /** Reconcile both local and remote mutations without moving the host's current selection. */
  applyResult(before: Conversation, { thread, turn }: MessageChangeResult) {
    const latest = this.host.getSnapshot();
    const received = latest.conversations[thread.id];
    const originalIds = new Set(before.turns.map((entry) => entry.id));
    const turns = new Map((thread.turns ?? []).map((entry) => [entry.id, entry]));
    received?.turns.forEach((entry) => {
      if (turns.has(entry.id) || !originalIds.has(entry.id)) turns.set(entry.id, entry);
    });
    this.host.patch({ conversations: { ...latest.conversations,
      [thread.id]: conversation({ ...thread, turns: [...turns.values()] }, received) } });
    if (turn) this.host.acceptTurn(thread.id, turn);
    void this.host.refresh();
  }
  submit: EditMessage = async (edit) => {
    const state = this.host.getSnapshot();
    const last = lastUserMessage(state.conversations[edit.threadId]);
    if (!canEditMessage(state) || state.selected !== edit.threadId || !edit.text.trim()
      || last?.turnId !== edit.turnId || last.item.id !== edit.itemId || last.item.localEcho) return false;
    const { model, effort, access } = state.settings;
    this.host.patch({ sending: true, error: "" });
    try {
      const result = await guiApi.request<MessageChangeResult>({
        operation: "editMessage",
        ...edit, model: model || undefined, effort: effort || undefined, access,
        cwd: state.projectOverrides[edit.threadId] });
      const { error } = result;
      if (error) this.recoveredDrafts.set(edit.threadId,
        editedMessageDraft(state.conversations[edit.threadId], edit));
      this.applyResult(state.conversations[edit.threadId], result);
      if (error) { this.host.report(uiText("client.composer.couldNotConfirmWhetherTheMessageWasSentYourEdits")); return false; }
      return true;
    } catch (error) { this.host.report(error); return false; }
    finally { this.host.patch({ sending: false }); this.host.flushQueue(); }
  };
}
