import { displayText } from '../localization/messages';
import { useEffect, useRef, useState } from 'react';
import { DownloadPolicyError } from './policy';
import { DownloadCancelled, downloadFile, type DownloadOptions } from './fileDownload';
import { DownloadProgress } from './downloadProgress';

interface Options {
  client: DownloadOptions['client']; threadId: string | null; path: string; ready: boolean;
  target: DownloadOptions['target']; success: string;
  prepare?: () => Promise<DownloadOptions['target']>;
}
export function useFileDownload(options: Options) {
  const active = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [message, setMessage] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current?.abort(); };
  }, []);
  useEffect(() => () => { active.current?.abort(); }, [options.threadId, options.path, options.client]);
  const cancel = () => active.current?.abort();
  const start = async () => {
    if (!options.ready || !options.threadId || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const meter = new DownloadProgress();
    setBusy(true); setProgress({ percent: 0, detail: '' }); setMessage('');
    try {
      const target = options.prepare ? await options.prepare() : options.target;
      await downloadFile({ ...options, threadId: options.threadId, signal: controller.signal,
        target,
        progress: (received, total) => {
          const update = meter.update(received, total);
          if (mounted.current && update) setProgress(update);
        } });
      if (mounted.current) setMessage(options.success);
    } catch (error) {
      if (mounted.current) setMessage(controller.signal.aborted || error instanceof DownloadCancelled ? '下载已取消'
        : error instanceof DownloadPolicyError ? error.message : '下载失败，请检查连接和存储空间后重试。');
    } finally {
      active.current = undefined;
      if (mounted.current) setBusy(false);
    }
  };
  return { busy, ...progress, message, start, cancel, label: busy
    ? displayText("client.shared.cancelDownload", { percent: progress.percent })
    : displayText("client.projectBrowser.download") };
}
