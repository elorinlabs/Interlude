import { useMemo, useState } from 'react';
import { HtmlPreviewFrame } from '../../../../shared/file-preview/HtmlPreviewFrame';
import { chatPreviewLoader } from '../../../../shared/file-preview/chatLoader';
import type { FileClient } from '../../../../shared/remote-chat/fileDownload';
import { t } from '../i18n';
import { ChatCodeBlock } from './ChatCodeBlock';
import { ChatCopyButton } from './ChatCopyButton';
import './markdownPreview.css';

export function isHtmlPath(path: string) { return /\.html?$/i.test(path); }

export function ChatHtmlPreview({ text, path, client, threadId }: {
  text: string; path: string; client: FileClient; threadId: string;
}) {
  const [source, setSource] = useState(false);
  const load = useMemo(() => chatPreviewLoader(client, threadId), [client, threadId]);
  return <section className="chat-html-preview">
    <div className="chat-markdown-preview-toolbar">
      <div className="chat-markdown-preview-modes" role="group" aria-label={t("client.chat.displayMode")}>
        <button type="button" aria-pressed={!source} onClick={() => setSource(false)}>{t("client.chat.preview")}</button>
        <button type="button" aria-pressed={source} onClick={() => setSource(true)}>{t("client.downloads.source")}</button>
      </div>
      <ChatCopyButton text={text} label={t("client.chat.copyFileContents")} />
    </div>
    {source ? <ChatCodeBlock text={text} language="html" label="HTML" copyLabel={t("client.chat.copyFileContents")} />
      : <HtmlPreviewFrame text={text} path={path} load={load} className="chat-html-frame" />}
  </section>;
}
