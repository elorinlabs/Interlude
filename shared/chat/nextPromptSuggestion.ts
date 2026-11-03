import type { Model, Request, Thread } from '../../apps/desktop/src/pages/codexGui/types';

export type PromptSuggestionTarget = Omit<Extract<Request, { operation: 'suggestNextPrompt' }>, 'operation'>;
export type RequestPromptSuggestion = (target: PromptSuggestionTarget) => Promise<{ suggestion: string | null }>;
export interface PromptSuggestionSource {
  target: PromptSuggestionTarget | null;
  enabled: boolean;
  visible?: boolean;
  scope?: string;
  storage?: import('./promptSuggestionCache').PromptSuggestionStorage;
  request: RequestPromptSuggestion;
}
const FAST_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const;

export function promptSuggestionTarget(thread: Pick<Thread, 'id' | 'turns'> | null | undefined,
  model: Model | undefined): PromptSuggestionTarget | null {
  const turn = thread?.turns?.at(-1);
  if (!thread || !turn || turn.status !== 'completed' || !model
    || !turn.items.some(item => item.type === 'agentMessage' && item.phase !== 'commentary'
      && item.delivery !== 'async' && item.text?.trim())) return null;
  const effort = FAST_EFFORTS.find(value => model.supportedReasoningEfforts
    .some(entry => entry.reasoningEffort === value));
  return effort ? { threadId: thread.id, sourceTurnId: turn.id, model: model.model, effort } : null;
}
