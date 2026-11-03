import { promptSuggestionTarget, type PromptSuggestionSource, type RequestPromptSuggestion }
  from '../../chat/nextPromptSuggestion';
import type { ChatState } from './types';

export function remotePromptSuggestion(state: ChatState, request: RequestPromptSuggestion,
  persistence: Pick<PromptSuggestionSource, 'scope' | 'storage'> = {}): PromptSuggestionSource {
  const thread = state.selected;
  const model = state.models.find(model => model.model === state.settings.model);
  return { request, ...persistence, target: promptSuggestionTarget(thread, model),
    visible: !state.selectedArchived && !state.sending && !state.compacting && !state.goalBusy
      && !thread?.turns?.some(turn => turn.status === 'inProgress')
      && !state.goals?.[thread?.id ?? ''] && !state.queue.threads[thread?.id ?? '']?.length
      && !state.approvals.some(event => event.params.threadId === thread?.id),
    enabled: state.ready && !state.connecting && !state.selectedArchived && !state.historyOffline
      && !state.loading && !state.historyLoading && !state.historyLoadingMore && !state.sending && !state.compacting
      && !state.goalBusy && !state.queueBusy && !state.error
      && !state.settingsBusy && !state.settingsError && !state.workspaceBusy
      && !thread?.turns?.some(turn => turn.status === 'inProgress')
      && !state.goals?.[thread?.id ?? ''] && !state.queue.threads[thread?.id ?? '']?.length
      && !state.approvals.some(event => event.params.threadId === thread?.id) };
}
