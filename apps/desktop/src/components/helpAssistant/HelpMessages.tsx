import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { HelpCopy } from './copy';
import type { HelpContent, HelpMessage } from './types';
import styles from './helpAssistant.module.less';

function Question({ content, copy }: { content: HelpContent; copy: HelpCopy }) {
  return <>{Boolean(content.images?.length) && <div className={styles.messageImages}>
    {content.images?.map((url, index) => <img key={index} src={url} alt={`${copy.image} ${index + 1}`} />)}
  </div>}{content.text}</>;
}

function Answer({ text }: { text: string }) {
  return <Markdown remarkPlugins={[remarkGfm]} skipHtml
    components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}>{text}</Markdown>;
}

export function HelpMessages(props: {
  messages: HelpMessage[]; pending?: HelpContent; streamed?: string; copy: HelpCopy;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'nearest' }); },
    [props.messages, props.pending, props.streamed]);
  return <div className={styles.messages} role="log" aria-live="polite" aria-label={props.copy.title}>
    {props.messages.map((message) => <article key={message.id}
      className={message.role === 'user' ? styles.question : styles.answer}>
      {message.role === 'user' ? <Question content={message} copy={props.copy} /> : <Answer text={message.text} />}
      {Boolean(message.sources?.length) && <details className={styles.sources}>
        <summary>{props.copy.sources}</summary>
        {message.sources?.map((source) => <div key={source}>{source}</div>)}
      </details>}
    </article>)}
    {props.pending && <><article className={styles.question}>
      <Question content={props.pending} copy={props.copy} /></article>
      {props.streamed ? <article className={styles.answer} aria-busy="true">
        <Answer text={props.streamed} /></article> :
        <div className={styles.thinking} role="status">{props.copy.thinking}</div>}</>}
    <div ref={bottom} />
  </div>;
}
