import { useEffect, useRef, useState } from 'react';

const PROGRESS_DELAY_MS = 800;
const NOTICE_DURATION_MS = 6000;
type Current = () => boolean;

/** Serialize gestures independently of rendering and discard stale work when the viewer closes. */
export function useClipboardQueue(active: boolean, open: boolean) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState<number>();
  const queue = useRef({ tail: Promise.resolve(), pending: 0 });
  const generation = useRef(0);
  useEffect(() => {
    if (!active) { setBusy(false); setProgress(undefined); setStatus(''); }
    return () => { generation.current += 1; queue.current = { tail: Promise.resolve(), pending: 0 }; };
  }, [active]);
  useEffect(() => {
    if (busy || open || !status) return;
    const timeout = setTimeout(() => setStatus(''), NOTICE_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [busy, open, status]);
  const run = <Result,>(operation: (current: Current) => Promise<Result>): Promise<Result | undefined> => {
    if (!active) return Promise.resolve(undefined);
    const started = generation.current;
    const current = () => generation.current === started;
    const pending = queue.current;
    pending.pending += 1; setBusy(true);
    const task = pending.tail.then(async () => {
      if (!current()) return;
      setStatus(''); setProgress(0);
      const notice = setTimeout(() => { if (current()) setStatus('正在传输剪贴板…'); }, PROGRESS_DELAY_MS);
      try { return await operation(current); }
      catch (error) {
        if (current()) setStatus(error instanceof Error ? error.message
          : typeof error === 'string' ? error : '剪贴板传输失败，请重试。');
      } finally {
        clearTimeout(notice); pending.pending -= 1;
        if (current()) { setBusy(pending.pending > 0); setProgress(undefined); }
      }
    });
    pending.tail = task.then(() => undefined);
    return task;
  };
  const report = (current: Current) => (completed: number, total: number) => {
    if (current()) setProgress(Math.round(completed / total * 100));
  };
  return { busy, status, progress, setStatus, run, report };
}
