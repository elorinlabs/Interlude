import type { ChatState } from './types';

export function compactUnavailableReason(state: ChatState): string | null {
  if (!state.ready) return "client.shared.connectToCompactContext";
  if (!state.selected) return "client.shared.startAConversationToCompactContext";
  if (state.selectedArchived) return "client.shared.restoreTheConversationToCompactContext";
  if (state.compacting) return "client.chat.compactingContext";
  if (state.sending || state.settingsBusy || state.selected.turns?.some((turn) => turn.status === 'inProgress')
    || state.approvals.some((event) => event.params.threadId === state.selected?.id)) return "client.shared.waitForTheCurrentTaskToFinish";
  return null;
}
