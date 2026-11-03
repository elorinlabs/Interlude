import { useEffect, useRef, useState } from 'react';
import { checkPreviewSize, type PreviewLoader } from './kinds';
import type { ProjectDocument } from '../project-browser/protocol';

export function usePreviewFile(options: {
  load: PreviewLoader; document: ProjectDocument; connected: boolean; enabled: boolean;
}) {
  const { load, document, connected, enabled } = options;
  const [file, setFile] = useState<Blob>();
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const loaded = useRef<{ document: ProjectDocument; file: Blob }>();
  useEffect(() => {
    setError(''); setProgress(0);
    if (loaded.current?.document === document) { setFile(loaded.current.file); return; }
    setFile(undefined);
    if (!enabled) return;
    if (!connected) { setError('client.projectBrowser.disconnectedReconnectToContinue'); return; }
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      checkPreviewSize(document.size);
      return load(document.path, { signal: controller.signal,
        progress: (received, total) => {
          if (!controller.signal.aborted) setProgress(total ? Math.round(received / total * 100) : 0);
        } });
    }).then(value => {
      if (!controller.signal.aborted) { loaded.current = { document, file: value }; setFile(value); }
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error && cause.message === 'client.filePreview.tooLarge'
        ? cause.message : 'client.filePreview.unavailable');
    });
    return () => controller.abort();
  }, [document, load, connected, enabled]);
  return { file, error, progress };
}
