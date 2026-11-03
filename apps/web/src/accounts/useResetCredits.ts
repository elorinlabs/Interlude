import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchResetCredits } from '../api';
import type { ResetCredit } from '../types';

export function useResetCredits(accountId: string) {
  const [credits, setCredits] = useState<ResetCredit[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const request = useRef<Promise<void> | null>(null);
  const reload = useCallback(() => {
    if (request.current) return request.current;
    const current = generation.current;
    setLoading(true);
    setError(false);
    const next = fetchResetCredits(accountId).then(result => {
      if (current === generation.current) setCredits(result.credits);
    }).catch(() => {
      if (current === generation.current) { setCredits(null); setError(true); }
    }).finally(() => {
      if (current === generation.current) setLoading(false);
      if (request.current === next) request.current = null;
    });
    request.current = next;
    return next;
  }, [accountId]);
  useEffect(() => {
    setCredits(null);
    void reload();
    return () => { generation.current += 1; request.current = null; };
  }, [reload]);
  return { credits, loading, error, reload };
}

export type ResetCreditsState = ReturnType<typeof useResetCredits>;
