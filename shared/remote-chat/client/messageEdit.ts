import type { MessageEdit, MessageTarget, MessageChangeResult }
  from '../../../apps/desktop/src/pages/codexGui/editMessage';
import { lastUserMessage } from '../../chat/latestUserMessage';
import { editedMessageDraft } from '../../../apps/desktop/src/pages/codexGui/editedMessageDraft';
import type { MessageInput } from '../../../apps/desktop/src/pages/codexGui/types';
import type { ChatState, Request, Thread } from './types';
import { threadActionReason } from './threadActions';
import { mergeHistory } from './history';

export function canEditRemoteMessage(state: ChatState): boolean {
  return Boolean(state.selected && !state.selectedArchived && !state.settingsBusy && !state.workspaceBusy
    && !state.queueBusy && !state.historyOffline && !threadActionReason(state, state.selected, 'delete'));
}

interface Host {
  snapshot: () => ChatState;
  update: (patch: Partial<ChatState>) => void;
  request: (body: Request) => Promise<MessageChangeResult>;
  invalidate: (threadId: string) => void;
  image: (threadId: string, source: string) => Promise<string>;
}

/** Own the edit transaction so reconnects and history reads cannot restore its removed suffix. */
export class RemoteMessageEditor {
  readonly recoveredDrafts = new Map<string, MessageInput>();
  busy = false;
  constructor(private readonly host: Host) {}
  submit = (edit: MessageEdit) => this.change(edit);
  remove = (target: MessageTarget) => this.change(target);

  private async change(target: MessageTarget | MessageEdit): Promise<boolean> {
    const state = this.host.snapshot();
    const before = state.selected;
    const edit = 'text' in target ? target : undefined;
    const last = lastUserMessage({ turns: before?.turns ?? [] });
    if (this.busy || !canEditRemoteMessage(state) || before?.id !== target.threadId
      || last?.turnId !== target.turnId || last.item.id !== target.itemId || last.item.localEcho
      || (edit && !edit.text.trim())) return false;
    this.busy = true;
    this.host.invalidate(target.threadId);
    this.host.update({ sending: true, error: '' });
    try {
      const recovered = edit ? editedMessageDraft({ turns: before.turns ?? [] }, edit) : undefined;
      if (recovered) recovered.images = await Promise.all(recovered.images.map(source =>
        source.startsWith('data:') ? source : this.host.image(before.id, source)));
      const result = await this.host.request(edit
        ? { operation: 'editMessage', ...edit, ...state.settings }
        : { operation: 'deleteMessage', ...target, access: state.settings.access });
      if (result.error && recovered) this.recoveredDrafts.set(before.id, recovered);
      this.applyResult(before, target, result);
      return !result.error;
    } catch (error) {
      this.host.update({ error: error instanceof Error ? error.message : '操作未完成，请稍后重试。' });
      return false;
    } finally {
      this.busy = false;
      this.host.update({ sending: false });
    }
  }

  private applyResult(before: Thread, target: MessageTarget, result: MessageChangeResult) {
    this.host.invalidate(before.id);
    const current = this.host.snapshot().selected;
    if (current?.id !== before.id) return;
    const prefix = before.turns?.slice(0, before.turns.findIndex(turn => turn.id === target.turnId)) ?? [];
    const turns = new Map(prefix.map(turn => [turn.id, turn]));
    result.thread.turns?.forEach(turn => turns.set(turn.id, turn));
    if (result.turn) turns.set(result.turn.id, result.turn);
    const originalIds = new Set(before.turns?.map(turn => turn.id));
    const live = { ...current, turns: current.turns?.filter(turn => turns.has(turn.id) || !originalIds.has(turn.id)) };
    const selected = mergeHistory({ ...result.thread, turns: [...turns.values()] }, live, before, true);
    this.host.update({ selected, historyOffline: false,
      error: result.error ? '未能确认发送结果。修改内容已放回输入框，请检查对话后重试。' : '' });
  }
}
