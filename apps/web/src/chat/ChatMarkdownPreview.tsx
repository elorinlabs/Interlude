import { useState } from 'react';
import { t, useLanguage } from '../i18n';
import { ChatCodeBlock } from './ChatCodeBlock';
import { ChatCopyButton } from './ChatCopyButton';
import { ChatMarkdown } from './ChatMarkdown';
import './markdownPreview.css';

export function ChatMarkdownPreview({ text }: { text: string }) {
  useLanguage();
  const [source, setSource] = useState(false);
  return <section className="chat-markdown-preview">
    <div className="chat-markdown-preview-toolbar">
      <div className="chat-markdown-preview-modes" role="group" aria-label={t("client.chat.displayMode")}>
        <button type="button" aria-pressed={!source} onClick={() => setSource(false)}>{t("client.chat.preview")}</button>
        <button type="button" aria-pressed={source} onClick={() => setSource(true)}>{t("client.chat.source")}</button>
      </div>
      <ChatCopyButton text={text} label={t("client.chat.copySource")} />
    </div>
    {source && <ChatCodeBlock text={text} language="markdown" label={t("client.chat.source")} copyLabel={t("client.chat.copySource")} />}
    {!source && (text.trim() ? <ChatMarkdown text={text} /> : <p className="chat-muted">{t("client.chat.emptyFile")}</p>)}
  </section>;
}
