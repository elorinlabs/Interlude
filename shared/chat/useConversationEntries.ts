import { useCallback, useMemo, useRef, useState } from 'react';
import { conversationEntries } from './turnPresentation';
import type { Turn } from '../remote-chat/client/types';

// The history component is keyed by conversation, so this state never carries into another conversation.
export function useConversationEntries(turns: Turn[]) {
  const observedLive = useRef(false);
  if (turns.some((turn) => turn.status === 'inProgress')) observedLive.current = true;
  const [inlineTurns, setInlineTurns] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const setInline = useCallback((turnId: string, inline: boolean) => {
    setInlineTurns((previous) => new Map(previous).set(turnId, inline));
  }, []);
  const entries = useMemo(() => conversationEntries(turns, inlineTurns), [turns, inlineTurns]);
  return { entries, setInline, hasObservedLiveTurn: observedLive.current };
}
