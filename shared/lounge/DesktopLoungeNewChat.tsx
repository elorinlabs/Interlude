import { useRef } from 'react';
import { Button, Input, Modal, type InputRef } from 'antd';
import { Check, Clock3, Search, UserRoundPlus, X } from 'lucide-react';
import { displayText as t } from '../localization/messages';
import { LoungeAvatar } from './LoungeAvatar';
import { accountName } from './names';
import type { NewLoungeChatOptions } from './useNewLoungeChat';
import { useDesktopNewLoungeChat, type DesktopNewLoungeChat } from './useDesktopNewLoungeChat';
import './desktopNewChat.css';

export function DesktopLoungeNewChat(props: NewLoungeChatOptions) {
  const model = useDesktopNewLoungeChat(props);
  const input = useRef<InputRef>(null);
  return <Modal open centered width={560} title={t('client.lounge.newChat')} footer={null}
    onCancel={model.cancel} afterOpenChange={open => { if (open) input.current?.focus(); }}
    closeIcon={<X size={22} aria-hidden />} className="lounge-new-chat-dialog lounge-desktop-new-chat">
    <form onSubmit={event => { event.preventDefault(); void model.submit(); }}>
      <div className="lounge-new-chat-intro">
        <span className="lounge-new-chat-section-icon"><UserRoundPlus size={22} aria-hidden /></span>
        <div><h3>{t('client.lounge.newChatSelectUser')}</h3>
          <p id="lounge-new-chat-hint">{t('client.lounge.newChatDesktopHint')}</p></div>
      </div>
      <Input ref={input} className="lounge-new-chat-search" maxLength={320} value={model.query}
        disabled={model.busy} prefix={<Search size={21} aria-hidden />} autoCapitalize="none" autoCorrect="off"
        aria-label={t('client.lounge.accountLookupLabel')} aria-describedby="lounge-new-chat-hint"
        placeholder={t('client.lounge.newChatSearchPlaceholder')} onChange={event => model.setQuery(event.target.value)} />
      {!model.available && <p role="status">{t('client.lounge.accountLookupFailed')}</p>}
      {model.error && <p role="alert">{t(model.error)}</p>}
      <RecentUsers model={model} />
      <div className="lounge-new-chat-footer">
        <Button onClick={model.cancel} autoInsertSpace={false}>{t('client.lounge.cancel')}</Button>
        <Button type="primary" htmlType="submit" loading={model.busy} disabled={!model.canSubmit}
          aria-label={t('client.lounge.directChat')} aria-busy={model.busy}>{t('client.lounge.directChat')}</Button>
      </div>
    </form>
  </Modal>;
}

function RecentUsers({ model }: { model: DesktopNewLoungeChat }) {
  return <section className="lounge-new-chat-recent" aria-labelledby="lounge-new-chat-recent-title">
    <div className="lounge-new-chat-recent-heading">
      <span className="lounge-new-chat-section-icon"><Clock3 size={23} aria-hidden /></span>
      <h3 id="lounge-new-chat-recent-title">{t('client.lounge.newChatRecentUsers')}</h3>
      <button type="button" className="lounge-new-chat-clear" onClick={model.clear}
        disabled={!model.hasRecent || model.busy}>{t('client.lounge.newChatClearRecent')}</button>
    </div>
    <div className="lounge-new-chat-people">
      {!model.speakers.length && <p className="lounge-new-chat-empty">{t(model.query.trim()
        ? 'client.lounge.newChatNoMatches' : 'client.lounge.newChatNoRecent')}</p>}
      {model.speakers.map(user => <button type="button" key={user.id}
        className="lounge-person lounge-new-chat-person" disabled={model.busy}
        aria-label={t('client.lounge.directWith', { account: accountName(user) })}
        aria-pressed={model.selected?.id === user.id} onClick={() => model.choose(user)}>
        <LoungeAvatar user={user} /><span className="lounge-person-copy">{accountName(user)}</span>
        {model.selected?.id === user.id && <Check size={20} className="lounge-new-chat-check" aria-hidden />}
      </button>)}
    </div>
  </section>;
}
