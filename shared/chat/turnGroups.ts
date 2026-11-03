import type { Item } from '../remote-chat/client/types';

export interface TurnItemGroup { type: 'work' | 'message'; items: Item[] }

/** Only process messages collapse; user steering and final answers stay in chronological order. */
export function groupTurnItems(items: Item[]): TurnItemGroup[] {
  const lastAnswer = items.reduce((last, item, index) => item.type === 'agentMessage' ? index : last, -1);
  return items.reduce<TurnItemGroup[]>((groups, item, index) => {
    const answer = item.type === 'agentMessage'
      && (item.phase === 'final_answer' || (!item.phase && index === lastAnswer));
    const type = item.type === 'userMessage' || item.type === 'modelChange' || answer ? 'message' : 'work';
    if (type === 'work' && groups.at(-1)?.type === 'work') groups[groups.length - 1].items.push(item);
    else groups.push({ type, items: [item] });
    return groups;
  }, []);
}
