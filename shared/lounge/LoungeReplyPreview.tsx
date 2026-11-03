import { accountName } from './names';
import { ArrowUp, X } from 'lucide-react';
import { displayText as t } from '../localization/messages';
import type { LoungeReply } from './reply';
import type { LoungeController } from './controller';
import type { LoungeMessage } from './types';
import { useQuotedMessage } from './useQuotedMessage';

interface Props { reply: LoungeReply; cancel?: () => void; controller?: LoungeController;
  locate?: (reference: LoungeReply) => void }

export function LoungeReplyPreview(props: Props) {
  return props.controller ? <ResolvedReply {...props} controller={props.controller} /> : <ReplyCard {...props} />;
}

function ResolvedReply(props: Props & { controller: LoungeController }) {
  const original = useQuotedMessage(props.controller, props.reply);
  return <ReplyCard {...props} original={original} />;
}

function ReplyCard({ reply, cancel, locate, original }: Props & { original?: LoungeMessage }) {
  const text = original?.text ?? reply.text;
  const content = <>
    <span className="lounge-reply-header"><span className="lounge-reply-account">
      {cancel ? t('client.lounge.replyingTo', { account: reply.account })
        : (original ? accountName(original.sender) : reply.account)}</span>
      {original && <time dateTime={original.sentAt}>{new Date(original.sentAt).toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit' })}</time>}{locate && <ArrowUp size={16} />}</span>
    {!!text && <span className="lounge-reply-text">{text}</span>}
    {original?.images[0] && <img className="lounge-reply-image" src={original.images[0]} alt={t('client.lounge.image')} />}
    {reply.imageCount > 0 && !original?.images[0] && <span>
      {t('client.lounge.quotedImages', { count: reply.imageCount })}</span>}
  </>;
  return <div className={`lounge-reply${cancel ? ' lounge-reply-draft' : ''}`}>
    {locate ? <button type="button" className="lounge-reply-content lounge-reply-link"
      aria-label={t('client.lounge.viewOriginal')} onClick={() => locate(reply)}>{content}</button>
      : <div className="lounge-reply-content">{content}</div>}
    {cancel && <button type="button" aria-label={t('client.lounge.cancelReply')} onClick={cancel}>
      <X size={16} /></button>}
  </div>;
}
