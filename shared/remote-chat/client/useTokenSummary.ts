import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAX_SUMMARY_WEEKS, MIN_SUMMARY_WEEKS, type ReadTokenSummary, type TokenSummary } from '../tokenSummary';
import { createDashboardLoader } from '../../../apps/desktop/src/components/TokenUsageDashboard/dashboardLoader';
import { browserTokenSummaryStorage, TokenSummaryCache, type TokenSummaryStorage } from './tokenSummaryCache';

const DEFAULT_SUMMARY_WEEKS = 2;

interface Options {
  read: ReadTokenSummary;
  active: boolean;
  scope: string;
  storage?: TokenSummaryStorage;
}

function emptySnapshot(cache: TokenSummaryCache) {
  return { cache, weeks: DEFAULT_SUMMARY_WEEKS, data: null as TokenSummary | null,
    hydrated: false, loading: false, error: '' };
}

export function useTokenSummary({ read, active, scope, storage = browserTokenSummaryStorage }: Options) {
  const cache = useMemo(() => new TokenSummaryCache(storage, scope), [storage, scope]);
  const [snapshot, setSnapshot] = useState(() => emptySnapshot(cache));
  // Never render another account or computer's data during a scope change.
  const current = snapshot.cache === cache ? snapshot : emptySnapshot(cache);
  const { weeks, data, hydrated, loading, error } = current;
  const scheduler = useRef(createDashboardLoader());
  const reload = useRef(() => undefined as void);

  useEffect(() => {
    let mounted = true;
    void cache.load().then(saved => {
      if (!mounted) return;
      setSnapshot(previous => previous.cache === cache && previous.hydrated ? previous : {
        ...emptySnapshot(cache), data: saved, weeks: saved?.weeks ?? DEFAULT_SUMMARY_WEEKS, hydrated: true,
      });
    });
    return () => { mounted = false; };
  }, [cache]);

  useEffect(() => {
    if (!active || !hydrated) {
      reload.current = () => undefined;
      setSnapshot(previous => previous.loading ? { ...previous, loading: false } : previous);
      return;
    }
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshSeconds = 60;
    const task = async () => {
      if (!mounted) return;
      clearTimeout(timer);
      setSnapshot(previous => ({ ...previous, loading: true, error: '' }));
      try {
        const next = await read(weeks);
        refreshSeconds = next.refreshSeconds;
        if (mounted) {
          setSnapshot(previous => ({ ...previous, data: next }));
          void cache.save(next);
        }
      } catch {
        if (mounted) setSnapshot(previous => ({ ...previous,
          error: '暂时无法加载，请确认电脑已连接且已更新至最新版本，再重试。' }));
      } finally {
        if (mounted) {
          setSnapshot(previous => ({ ...previous, loading: false }));
          timer = setTimeout(() => { void scheduler.current(task); }, refreshSeconds * 1000);
        }
      }
    };
    reload.current = () => { void scheduler.current(task); };
    void scheduler.current(task, true);
    return () => { mounted = false; clearTimeout(timer); };
  }, [active, read, weeks, cache, hydrated]);

  const changeWeeks = useCallback((value: number) => {
    if (!Number.isInteger(value) || value < MIN_SUMMARY_WEEKS || value > MAX_SUMMARY_WEEKS) return;
    setSnapshot(previous => ({ ...(previous.cache === cache ? previous : emptySnapshot(cache)),
      weeks: value, hydrated: true }));
  }, [cache]);
  const refresh = useCallback(() => reload.current(), []);
  return { data, weeks, loading, error, changeWeeks, refresh };
}
