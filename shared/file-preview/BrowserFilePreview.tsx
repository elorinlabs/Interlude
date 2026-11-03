import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ProjectPreviewProps } from '../project-browser/preview';
import { displayText as t } from '../localization/messages';
import { filePreviewKind, type PreviewLoader } from './kinds';
import { usePreviewFile } from './usePreviewFile';
import { PreviewContent } from '../../apps/desktop/src/pages/codexGui/filePreview/PreviewContent';
import { BrowserMarkdown } from './BrowserMarkdown';
import { HtmlPreviewFrame } from './HtmlPreviewFrame';
import { BrowserImagePreview } from './BrowserImagePreview';
import './browserFilePreview.css';

const PdfPreview = lazy(() => import('./PdfPreview'));

export function browserFileRenderer(load: PreviewLoader) {
  return (props: ProjectPreviewProps) => filePreviewKind(props.document.path)
    ? <BrowserFilePreview {...props} load={load} /> : undefined;
}

function BinaryPreview({ load, document, connected, active }: ProjectPreviewProps & { load: PreviewLoader }) {
  const result = usePreviewFile({ load, document, connected, enabled: active });
  const [url, setUrl] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const kind = filePreviewKind(document.path)!;
  const name = document.path.split(/[\\/]/).at(-1) ?? '';
  useEffect(() => {
    if (!result.file || kind === 'pdf') { setUrl(''); return; }
    const url = URL.createObjectURL(result.file);
    setUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result.file, kind]);
  useEffect(() => {
    const element = host.current;
    const pause = () => element?.querySelectorAll('video, audio').forEach(media => (media as HTMLMediaElement).pause());
    if (!active) pause();
    return pause;
  }, [active, url]);
  if (result.error) return <p role="status" className="file-preview-feedback">{t(result.error)}</p>;
  if (!result.file || (!url && kind !== 'pdf')) return <p role="status" className="file-preview-feedback">
    {t('client.projectBrowser.loading')} {result.progress}%</p>;
  return <div className="browser-file-media" ref={host}>
    {kind === 'pdf' ? <Suspense fallback={<p role="status">{t('client.projectBrowser.loading')}</p>}>
      <PdfPreview file={result.file} name={name} /></Suspense>
      : kind === 'image' ? <BrowserImagePreview src={url} name={name} />
        : <PreviewContent source={false} data={{ sessionId: '', path: document.path, name, kind, text: null, url }} />}
  </div>;
}

function BrowserFilePreview(props: ProjectPreviewProps & { load: PreviewLoader }) {
  const [source, setSource] = useState(false);
  const kind = filePreviewKind(props.document.path);
  const textDocument = (kind === 'html' || kind === 'markdown') && props.document.kind === 'text';
  if (kind === 'image' && props.document.image) return <BrowserImagePreview src={props.document.image}
    name={props.document.path.split(/[\\/]/).at(-1) ?? ''} />;
  // Every HTML preview has an opaque origin, including scripts written into an unsaved draft.
  if (!textDocument) return <BinaryPreview {...props} />;
  return <div className="browser-document-preview">
    <div className="browser-preview-modes" role="group" aria-label={t('client.chat.displayMode')}>
      <button type="button" aria-pressed={!source} onClick={() => setSource(false)}>{t('client.chat.preview')}</button>
      <button type="button" aria-pressed={source} onClick={() => setSource(true)}>{t('client.downloads.source')}</button>
    </div>
    {source ? props.editor : kind === 'markdown' ? <BrowserMarkdown text={props.text} path={props.document.path}
      load={props.load} openFile={props.openFile} />
      : <HtmlPreviewFrame text={props.text} path={props.document.path} load={props.load} />}
  </div>;
}
