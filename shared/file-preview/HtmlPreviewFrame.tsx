import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { displayText as t } from '../localization/messages';
import type { PreviewLoader } from './kinds';
import { prepareHtmlPreview } from './htmlAssets';
import { loadHtmlMedia, type HtmlMediaUpdate } from './htmlMedia';

type PreparedPreview = Awaited<ReturnType<typeof prepareHtmlPreview>> & {
  channel: string; controller: AbortController;
};

export function HtmlPreviewFrame({ text, path, load, className }: {
  text: string; path: string; load: PreviewLoader; className?: string;
}) {
  const [result, setResult] = useState<PreparedPreview>();
  const [failed, setFailed] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const started = useRef<PreparedPreview>();
  useEffect(() => {
    const controller = new AbortController();
    const channel = crypto.randomUUID();
    setResult(undefined); setFailed(false);
    void prepareHtmlPreview({ text, path, load, signal: controller.signal, mediaChannel: channel }).then(value => {
      if (!controller.signal.aborted) { setResult({ ...value, channel, controller }); setFailed(value.failed); }
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [text, path, load]);
  const loadMedia = () => {
    if (!result || started.current === result) return;
    started.current = result;
    const { controller, channel } = result;
    void loadHtmlMedia({ assets: result.media, signal: controller.signal, update: (asset, value) => {
      const update: HtmlMediaUpdate = { channel, id: asset.id, attribute: asset.attribute, value };
      frame.current?.contentWindow?.postMessage(update, '*');
      if (result.hasFailed()) setFailed(true);
    } }).then(() => {
      if (!controller.signal.aborted) frame.current?.contentWindow?.postMessage({ channel, type: 'complete' }, '*');
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
  };
  useLayoutEffect(() => {
    const ready = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.channel === result?.channel
        && event.data?.type === 'ready') loadMedia();
    };
    window.addEventListener('message', ready);
    return () => window.removeEventListener('message', ready);
  }, [result]);
  if (!result) return <p role="status">{t(failed ? 'client.filePreview.unavailable' : 'client.projectBrowser.loading')}</p>;
  return <>
    {failed && <p role="status">{t('client.filePreview.someHtmlAssetsUnavailable')}</p>}
    <iframe ref={frame} title={t('client.downloads.htmlPreview')}
      srcDoc={result.html} sandbox="allow-scripts"
      referrerPolicy="no-referrer" className={className} />
  </>;
}
