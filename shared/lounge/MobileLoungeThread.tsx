import { accountName } from './names';
import { useLayoutEffect, useRef } from 'react';
import { MessagesSquare } from 'lucide-react';
import { displayText as t } from '../localization/messages';
import type { MobileLounge } from './useMobileLounge';
import { LoungeAvatar } from './LoungeAvatar';
import { LoungeMessageBody } from './LoungeMessageBody';
import type { LoungeController } from './controller';
import { historyKey } from './archive';
import { scrollToLoungeMessage } from './scrollToMessage';

export function MobileLoungeThread({ model, controller }: { model: MobileLounge; controller: LoungeController }) {
  const { state, offsets, scrollPositions, atBottom, setAtBottom } = model;
  const list = useRef<HTMLDivElement>(null);
  const restoring = useRef(true);
  const { focus, messages, highlight } = model.navigation;
  const scrollBottom = () => {
    if (focus && highlight) { scrollToLoungeMessage(list.current, focus.key); return; }
    if (atBottom && list.current) list.current.scrollTop = list.current.scrollHeight;
  };
  useLayoutEffect(() => {
    if (!focus) return;
    const frame = requestAnimationFrame(() => scrollToLoungeMessage(list.current, focus.key));
    return () => cancelAnimationFrame(frame);
  }, [focus]);
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    if (focus) { restoring.current = false; return; }
    restoring.current = true;
    const position = scrollPositions.current.get(state.conversation) ?? 0;
    const frame = requestAnimationFrame(() => {
      node.scrollTop = atBottom ? node.scrollHeight : position;
      restoring.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [state.conversation, messages, atBottom, scrollPositions, focus]);
  return <div ref={list} className="lounge-conversation" role="log" aria-live="off"
    aria-label={t('client.lounge.title')} onScroll={() => {
      const node = list.current;
      if (!node || restoring.current) return;
      const offset = Math.max(0, node.scrollHeight - node.clientHeight - node.scrollTop);
      offsets.current.set(state.conversation, offset);
      scrollPositions.current.set(state.conversation, node.scrollTop); setAtBottom(!focus && offset < 48);
    }}>
    {!messages.length && <div className="lounge-empty">
      <span className="lounge-empty-symbol"><MessagesSquare size={27} /></span>
      <h2>{t(model.contact ? 'client.lounge.directEmpty' : 'client.lounge.empty')}</h2>
      <p>{t('client.lounge.emptyHint')}</p>
      <button type="button" className="lounge-greeting" onClick={() => model.draftState.change({
        ...model.draftState.draft, text: t(model.contact ? 'client.lounge.directGreeting' : 'client.lounge.greeting'),
      })}>{t(model.contact ? 'client.lounge.directGreeting' : 'client.lounge.greeting')}</button>
    </div>}
    {messages.map(message => {
      const own = message.sender.id === state.user?.id;
      return <article key={historyKey(message)} data-lounge-message-key={historyKey(message)}
        className={`lounge-message${own ? ' is-own' : ''}${highlight === historyKey(message) ? ' is-highlighted' : ''}`}>
        <LoungeAvatar user={message.sender} onProfile={() => model.setProfile(message.sender)} />
        <div className="lounge-message-main">
          {!own && state.policy.moderator ? <button type="button" className="lounge-account lounge-account-action"
            aria-label={t('client.lounge.manageUser', { account: accountName(message.sender) })}
            onClick={() => model.setModerating(message.sender)}>{accountName(message.sender)}</button>
            : <div className="lounge-account">{accountName(message.sender)}</div>}
          <LoungeMessageBody message={message} preview={model.setPreview} onImageLoad={scrollBottom}
            controller={controller} locate={model.locate}
            actions={{ reply: model.quote, blocked: state.blocked.includes(message.sender.id),
              direct: !own && state.directAvailable ? () => model.select(message.sender) : undefined,
              block: !own && state.directAvailable ? () => model.setBlocking(message.sender) : undefined }} />
          <time className="lounge-message-time" dateTime={message.sentAt}>
            {new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        </div>
      </article>;
    })}
  </div>;
}
