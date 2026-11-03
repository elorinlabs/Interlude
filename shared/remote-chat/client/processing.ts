import { processingApproval, restoreProcessing, trackProcessing } from '../../../apps/desktop/src/pages/codexGui/processing';
import type { ChatState, GuiEvent } from './types';
import { currentRunningTurn } from '../../chat/runningTurn';

/** Share the desktop activity ordering and phase clock across mobile clients. */
export function syncChatProcessing(state: ChatState, previous: ChatState, event?: GuiEvent): ChatState {
  const thread = state.selected;
  const turn = currentRunningTurn(thread?.turns);
  if (!thread || !turn || event?.method === 'connection/closed' || event?.method === 'codex/disconnected') {
    return { ...state, processing: undefined };
  }
  const prior = previous.selected?.id === thread.id && previous.processing?.turnId === turn.id
    ? previous.processing : undefined;
  let processing = restoreProcessing(turn, prior);
  if (!event && thread !== previous.selected) {
    const restored = restoreProcessing(turn);
    // A refreshed snapshot must remove completed activities without restarting the same phase.
    processing = prior && restored.id === prior.id && restored.phase === prior.phase
      ? { ...restored, startedAtMs: prior.startedAtMs } : restored;
  }
  if (event?.id == null && event?.params.threadId === thread.id) {
    processing = trackProcessing({ thread, turns: thread.turns ?? [], activeTurn: turn.id,
      tokens: 0, error: '', processing }, event).processing ?? processing;
  }
  const approvals = state.approvals.filter((entry) => entry.params.threadId === thread.id
    && (!entry.params.turnId || entry.params.turnId === turn.id));
  for (const activity of processing.activities) {
    if (activity.phase !== 'approval' && activity.phase !== 'input') continue;
    if (approvals.some((entry) => `approval:${entry.id}` === activity.id)) continue;
    processing = processingApproval(processing, {
      id: activity.id.slice('approval:'.length), method: '', params: {},
    }, true);
  }
  for (const approval of approvals) processing = processingApproval(processing, approval);
  if (!event && prior?.id === processing.id && prior.phase === processing.phase) {
    processing = { ...processing, startedAtMs: prior.startedAtMs };
  }
  return { ...state, processing };
}
