import { useEffect, useState } from 'react';
import { previewReference } from '../../apps/desktop/src/pages/codexGui/filePreview/references';
import type { PreviewLoader } from './kinds';

export function BrowserPreviewImage({ src, alt, path, load }: {
  src?: string; alt?: string; path: string; load: PreviewLoader;
}) {
  const reference = src ? previewReference(src, path) : undefined;
  const [url, setUrl] = useState('');
  useEffect(() => {
    setUrl('');
    if (!reference) return;
    const controller = new AbortController();
    let url = '';
    void load(reference.path, { signal: controller.signal, progress: () => {} }).then(file => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(file); setUrl(url);
    }).catch(() => { /* Keep the image's alternative text when a referenced asset is unavailable. */ });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [reference?.path, load]);
  const source = reference ? url : src;
  return source ? <img src={source} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" /> : <span>{alt}</span>;
}
