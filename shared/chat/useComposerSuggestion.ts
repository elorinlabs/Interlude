import { useRef } from 'react';
import type { PromptSuggestionSource } from './nextPromptSuggestion';
import { usePromptSuggestion } from './usePromptSuggestion';

/** Acceptance fills the draft only; submitting remains the composer's normal send action. */
export function useComposerSuggestion(options: {
  source?: PromptSuggestionSource; blocked: boolean; value: string; fill: (text: string) => void;
}) {
  const suggestion = usePromptSuggestion(options.source, options.blocked || Boolean(options.value));
  const available = useRef('');
  available.current = suggestion.text;
  const dismiss = () => { available.current = ''; suggestion.dismiss(); };
  const accept = () => {
    const text = available.current;
    if (!text || options.value || options.blocked) return false;
    dismiss(); options.fill(text);
    return true;
  };
  return { text: suggestion.text, dismiss, restore: suggestion.restore, accept };
}
