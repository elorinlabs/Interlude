import { displayError } from '../i18n/index';
import { t, useLanguage } from '../i18n';
import { ArrowDown, ArrowUp, CornerDownRight, Trash2 } from 'lucide-react';
import type { QueueProps } from '../../../../shared/remote-chat/client/queueProps';
import './queue.css';
import { useQueueSelection } from '../../../../shared/remote-chat/client/useQueueSelection';

type Props = QueueProps & { edit: (id: string) => Promise<void>; editDisabled: boolean };

export function ChatQueue({ messages, running, disabled, act, edit, editDisabled }: Props) {
  useLanguage();
  const { selected, select, canMoveUp, canMoveDown } = useQueueSelection(messages, disabled);
  if (!messages.length) return null;
  const sending = messages.some((message) => message.busy);
  return <section className="chat-queue" aria-label={t("client.chat.queuedMessages")}>
    <div className="chat-queue-heading"><span>{t("client.chat.queued")} {messages.length}</span>
      <div className="chat-queue-actions">
      {!running && <button type="button" disabled={disabled || sending}
        onClick={() => void act('queueFlush')}>{t("client.chat.sendAll")}</button>}
      <button type="button" aria-label={t("client.chat.moveQueuedMessageUp")} disabled={!canMoveUp}
        onClick={() => void act('queueMoveUp', selected.id)}><ArrowUp size={17} aria-hidden="true" /></button>
      <button type="button" aria-label={t("client.chat.moveQueuedMessageDown")} disabled={!canMoveDown}
        onClick={() => void act('queueMoveDown', selected.id)}><ArrowDown size={17} aria-hidden="true" /></button>
      <button type="button" aria-label={t("client.chat.editQueuedMessage")} disabled={disabled || editDisabled || selected.busy}
        onClick={() => void edit(selected.id)}>{t("client.chat.edit.051836")}</button></div></div>
    <ul>{messages.map((message) => <li key={message.id}
      className={messages.length > 1 && selected.id === message.id ? 'chat-queue-selected' : undefined}>
      <CornerDownRight size={15} aria-hidden="true" />
      <div className="chat-queue-content"><button type="button" className="chat-queue-select"
        aria-label={t("client.chat.selectQueuedMessage", { value1: message.text })} aria-pressed={selected.id === message.id}
        onClick={() => select(message.id)}><p>{message.text || t("client.chat.imageMessage")}</p></button>
        {message.imageCount > 0 && <small>{message.imageCount}  {t("client.chat.images")} </small>}
        {message.attachmentCount > 0 && <small>{message.attachmentCount}  {t("client.chat.attachments")}</small>}
        {message.busy && <small role="status">{t("client.chat.sending")}</small>}
        {message.error && <small role="alert" className="chat-queue-error">{displayError(message.error)}</small>}
      </div>
      <button type="button" disabled={disabled || sending} onPointerDown={(event) => event.preventDefault()}
        onClick={() => void act('queueSendNow', message.id)}>{t("client.chat.sendNow")}</button>
      <button type="button" aria-label={t("client.chat.deleteQueuedMessage")} disabled={disabled || message.busy}
        onPointerDown={(event) => event.preventDefault()} onClick={() => void act('queueRemove', message.id)}>
        <Trash2 size={16} aria-hidden="true" /></button>
    </li>)}</ul>
  </section>;
}
