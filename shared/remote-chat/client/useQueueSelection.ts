import { useEffect, useState } from 'react';
import type { QueueMessage } from '../queue';

export function useQueueSelection(messages: QueueMessage[], disabled: boolean) {
  const [selectedId, select] = useState<string | null>(null);
  const selected = messages.find((message) => message.id === selectedId) ?? messages[0];
  useEffect(() => { select(selected?.id ?? null); }, [selected?.id]);
  const index = messages.indexOf(selected);
  return { selected, select,
    canMoveUp: !disabled && !selected?.busy && index > 0 && !messages[index - 1].busy,
    canMoveDown: !disabled && !selected?.busy && index < messages.length - 1 && !messages[index + 1]?.busy };
}
