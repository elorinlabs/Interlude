import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { displayText as t } from '../localization/messages';

const MAX_CANVAS_PIXELS = 8_000_000;

export function PdfPage({ document, page, width, name }: {
  document: PDFDocumentProxy; page: number; width: number; name: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | undefined;
    const canvas = window.document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', name);
    setError(false);
    void document.getPage(page).then(async pdfPage => {
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: width / base.width });
      const density = Math.min(window.devicePixelRatio || 1,
        Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
      canvas.width = Math.max(1, Math.floor(viewport.width * density));
      canvas.height = Math.max(1, Math.floor(viewport.height * density));
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      task = pdfPage.render({ canvas, viewport, transform: [density, 0, 0, density, 0, 0] });
      await task.promise;
      if (!cancelled) host.current?.replaceChildren(canvas);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; task?.cancel(); canvas.remove(); };
  }, [document, page, width, name]);
  return <div ref={host} className="file-pdf-page">
    {error && <p role="status" className="file-preview-feedback">{t('client.filePreview.pdfUnavailable')}</p>}
  </div>;
}
