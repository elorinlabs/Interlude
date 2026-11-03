import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const gitErrorText = (error: unknown) => typeof error === 'string' ? error
  : error instanceof Error ? error.message : '无法读取 Git 信息，请稍后重试。';

/** Background reads share a gate with actions; a click waits for the read instead of being discarded. */
export function useGitRequests({ scope, enabled, load, refreshInterval }: {
  scope: object; enabled: boolean; load: () => Promise<void>; refreshInterval?: number;
}) {
  const gate = useMemo<{ background?: Promise<void>; busy: boolean }>(() => ({ busy: false }), [scope]);
  const current = useRef(gate);
  const available = useRef(enabled);
  current.current = gate; available.current = enabled;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const run = useCallback(async (action: () => Promise<void>) => {
    if (gate.busy || !available.current || current.current !== gate) return;
    gate.busy = true; setBusy(true); setError(''); setNotice('');
    try {
      await gate.background;
      if (available.current && current.current === gate) await action();
    } catch (error) { if (current.current === gate) setError(gitErrorText(error)); }
    finally { gate.busy = false; if (current.current === gate) setBusy(false); }
  }, [gate]);
  const poll = useCallback(() => {
    if (gate.busy || gate.background || !available.current || current.current !== gate) return;
    gate.background = load().then(() => {
      if (current.current === gate) setLoadError('');
    }).catch(error => {
      if (current.current === gate) setLoadError(gitErrorText(error));
    }).finally(() => { gate.background = undefined; });
  }, [gate, load]);
  useEffect(() => {
    current.current = gate;
    setBusy(false); setError(''); setLoadError(''); setNotice('');
    return () => { current.current = { busy: false }; };
  }, [gate]);
  useEffect(() => {
    if (!enabled) return;
    poll();
    if (!refreshInterval) return;
    const timer = setInterval(poll, refreshInterval);
    return () => clearInterval(timer);
  }, [enabled, poll, refreshInterval]);
  const refresh = useCallback(() => run(async () => { setLoadError(''); await load(); }), [run, load]);
  const clearActionError = useCallback(() => setError(''), []);
  return { busy, error: error || loadError, notice, setNotice, run, refresh, clearActionError };
}
