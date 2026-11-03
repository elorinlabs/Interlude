import type { Item, Turn } from '../../apps/desktop/src/pages/codexGui/types';
import { followsStoppedTurn, visibleContinuationItems } from '../../apps/desktop/src/pages/codexGui/continuation';

/** Hidden continuation prompts do not replace the last message written by the user. */
export function lastUserMessage(value?: { turns: Turn[] }): { turnId: string; item: Item } | undefined {
  if (!value) return;
  for (let index = value.turns.length - 1; index >= 0; index--) {
    const turn = value.turns[index];
    const items = followsStoppedTurn(value.turns[index - 1]) ? visibleContinuationItems(turn.items) : turn.items;
    const item = items.filter(entry => entry.type === 'userMessage').at(-1);
    if (item) return { turnId: turn.id, item };
  }
}
