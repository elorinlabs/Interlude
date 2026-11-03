import { useEffect, useRef, useState } from 'react';
import { historyKey, historyPosition } from './archive';
import type { LoungeController } from './controller';
import type { LoungeReply } from './reply';
import type { LoungeMessage, LoungeSnapshot } from './types';

const CONTEXT_MESSAGES = 40;
const HIGHLIGHT_MS = 3000;
interface MessageFocus {
  owner: LoungeController; key: string; request: number; conversation: string; context?: LoungeMessage[];
}
export type LoungeNavigationError = 'client.lounge.originalMissing' | 'client.lounge.originalLoadFailed';

/** Resolve references within the current conversation, including messages outside the live window. */
export function useLoungeNavigation(controller: LoungeController, state: LoungeSnapshot) {
  const [focus, setFocus] = useState<MessageFocus>();
  const [highlight, setHighlight] = useState<string>();
  const [error, setError] = useState<LoungeNavigationError>();
  const request = useRef(0);
  const clear = () => { request.current++; setFocus(undefined); setHighlight(undefined); setError(undefined); };
  useEffect(() => { clear(); return () => { request.current++; }; }, [controller, state.conversation]);
  useEffect(() => {
    if (!focus) return;
    setHighlight(focus.key);
    const timer = setTimeout(() => setHighlight(undefined), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [focus]);
  const locate = async (reference: LoungeReply) => {
    const current = ++request.current;
    const conversation = controller.snapshot().conversation;
    setError(undefined);
    try {
      const original = await controller.lookupMessage(reference, conversation);
      if (current !== request.current) return false;
      if (!original) { setError('client.lounge.originalMissing'); return false; }
      const key = historyKey(original);
      let context = controller.snapshot().messages;
      if (!context.some(message => historyKey(message) === key)) {
        // The original is already persisted; unrelated incoming writes must not delay navigation.
        const page = await controller.searchHistory({ query: '', conversation,
          before: historyPosition(original), limit: CONTEXT_MESSAGES }, { committedOnly: true });
        context = [...page.messages.reverse(), original];
      }
      if (current !== request.current) return false;
      setFocus({ owner: controller, key, request: current, conversation, context });
      return true;
    } catch {
      if (current === request.current) setError('client.lounge.originalLoadFailed');
      return false;
    }
  };
  const active = focus?.owner === controller && focus.conversation === state.conversation ? focus : undefined;
  const messages = active?.context?.map(message => message.sender.id === state.user?.id
    ? { ...message, sender: state.user } : message) ?? state.messages;
  return { focus: active, highlight, error, locate, clear, messages };
}
