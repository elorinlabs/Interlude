import { useEffect, useRef, useState } from 'react';
import { USAGE_REFRESH_INTERVAL_MS, type ReadUsage, type UsageSummary } from '../usage';
import { decodeUsageSummary } from '../usageSummary';

export function useChatUsage(read: ReadUsage, active: boolean) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState('');
  const pending = useRef(new Set<ReadUsage>());
  useEffect(() => {
    setUsage(null); setError('');
    if (!active) return;
    let disposed = false;
    const refresh = async () => {
      if (disposed || pending.current.has(read)) return;
      pending.current.add(read);
      try {
        const next = decodeUsageSummary(await read());
        if (!disposed) { setUsage(next); setError(''); }
      } catch (reason) {
        if (disposed) return;
        setUsage(null);
        setError(reason instanceof Error && reason.message.includes('暂不支持')
          ? '请更新电脑端后查看用量。' : '暂时无法刷新用量，请稍后重试。');
      } finally { pending.current.delete(read); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), USAGE_REFRESH_INTERVAL_MS);
    return () => { disposed = true; clearInterval(timer); };
  }, [read, active]);
  return { usage: active ? usage : null, error: active ? error : '' };
}
