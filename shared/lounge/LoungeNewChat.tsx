import { accountName } from './names';
import { Button, Input } from 'antd';
import { displayText as t } from '../localization/messages';
import { LoungeAvatar } from './LoungeAvatar';
import { MobileLoungeSheet } from './MobileLoungeSheet';
import { useNewLoungeChat, type NewLoungeChat, type NewLoungeChatOptions } from './useNewLoungeChat';

export { DesktopLoungeNewChat as LoungeNewChat } from './DesktopLoungeNewChat';

export function MobileLoungeNewChat(props: NewLoungeChatOptions) {
  const model = useNewLoungeChat(props);
  return <MobileLoungeSheet title={t('client.lounge.newChat')} close={model.cancel}>
    <div className="lounge-new-chat-dialog lounge-new-chat-mobile"><MobileNewChatContent model={model} /></div>
  </MobileLoungeSheet>;
}

function MobileNewChatContent({ model }: { model: NewLoungeChat }) {
  const { query, setQuery, busy, error, available, speakers, open, submit } = model;
  return <>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <p id="lounge-new-chat-hint">{t('client.lounge.accountLookupHint')}</p>
      <Input maxLength={320} value={query} disabled={busy}
        autoCapitalize="none" autoCorrect="off" inputMode="email" enterKeyHint="go"
        aria-label={t('client.lounge.accountLookupLabel')} aria-describedby="lounge-new-chat-hint"
        placeholder={t('client.lounge.accountLookupLabel')}
        onChange={event => setQuery(event.target.value)} />
      <Button type="primary" htmlType="submit" loading={busy} disabled={!query.trim() || !available}
        aria-label={t('client.lounge.directChat')} aria-busy={busy}>
        {t('client.lounge.directChat')}</Button>
      {!available && <p role="status">{t('client.lounge.accountLookupFailed')}</p>}
      {error && <p role="alert">{t(error)}</p>}
    </form>
    <h3>{t('client.lounge.recentSpeakers')}</h3>
    <div className="lounge-new-chat-people">
      {!speakers.length && <p>{t('client.lounge.noRecentSpeakers')}</p>}
      {speakers.map(user => <button type="button" key={user.id} className="lounge-person"
        aria-label={t('client.lounge.directWith', { account: accountName(user) })} onClick={() => open(user)}>
        <LoungeAvatar user={user} /><span className="lounge-person-copy">{accountName(user)}</span>
      </button>)}
    </div>
  </>;
}
