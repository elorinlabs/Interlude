import { useEffect, useRef, useState } from 'react';
import type { LoungeController } from './controller';
import type { LoungeAccount, LoungeSnapshot } from './types';

export interface NewLoungeChatOptions {
  controller: LoungeController;
  state: LoungeSnapshot;
  select: (user: LoungeAccount) => void;
  close: () => void;
}

/** Share exact account lookup and cancellation across desktop, mobile web and native. */
export function useNewLoungeChat({ controller, state, select, close }: NewLoungeChatOptions) {
  const [query, changeQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    setBusy(false); setError('');
    return () => request.current?.abort();
  }, [controller]);
  const available = state.status === 'connected' && state.directAvailable && state.accountLookupAvailable === true;
  const speakers = controller.recentSpeakers();
  const cancel = () => { request.current?.abort(); close(); };
  const open = (user: LoungeAccount) => { request.current?.abort(); select(user); close(); };
  const setQuery = (value: string) => { changeQuery(value); setError(''); };
  const submit = async () => {
    if (!query.trim() || request.current && !request.current.signal.aborted || !available) return;
    const current = new AbortController(); request.current = current;
    setBusy(true); setError('');
    try {
      const user = await controller.findAccount(query, current.signal);
      if (!current.signal.aborted) open(user);
    } catch (reason) {
      if (!current.signal.aborted) {
        setError(reason instanceof Error ? reason.message : 'client.lounge.accountLookupFailed');
      }
    } finally {
      if (!current.signal.aborted) setBusy(false);
      if (request.current === current) request.current = undefined;
    }
  };
  return { query, setQuery, busy, error, available, speakers, cancel, open, submit };
}

export type NewLoungeChat = ReturnType<typeof useNewLoungeChat>;
