import { accountName, accountMatches } from './names';
import { useState } from 'react';
import { ChevronLeft, Plus, Search, UserRound } from 'lucide-react';
import { displayText as t } from '../localization/messages';
import type { LoungeController } from './controller';
import type { MobileLounge } from './useMobileLounge';
import { conversationRows } from './conversationRows';
import { LoungeAvatar } from './LoungeAvatar';
import { contactStatus } from './contacts';
import { MobileLoungeSheet } from './MobileLoungeSheet';
import { MobileLoungeChatRow } from './MobileLoungeChatRow';
import { LoungeSwipeRow } from './LoungeSwipeRow';
import { MobileLoungeChatActions } from './MobileLoungeChatActions';
import { MobileLoungeChatTrigger } from './MobileLoungeChatTrigger';

export function MobileLoungeChats({ model, controller, onBack }: {
  model: MobileLounge; controller: LoungeController; onBack?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<string>();
  const rows = conversationRows({ state: model.state, controller, drafts: model.drafts }).filter(row =>
    row.user ? accountMatches(row.user, query)
      : t('client.lounge.groupChat').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const actionRow = rows.find(row => row.id === menu);
  return <section className="lounge-chat-list">
    <header className="lounge-mobile-heading">
      <button type="button" aria-label={t('client.discovery.back')} onClick={onBack}>
        <ChevronLeft size={22} /></button><h1>{t('client.lounge.chats')}</h1>
      {model.state.user && <button type="button" aria-label={t('client.lounge.profile')}
        onClick={() => model.setProfile(model.state.user)}><UserRound size={22} /></button>}
      <button type="button" className="lounge-new-chat" onClick={() => model.setSheet('new-chat')}
        disabled={!model.state.directAvailable}>
        <Plus size={18} aria-hidden="true" />{t('client.lounge.newChat')}</button>
    </header>
    <label className="lounge-chat-search"><Search size={18} /><input value={query}
      onChange={event => setQuery(event.target.value)} aria-label={t('client.lounge.searchChats')}
      placeholder={t('client.lounge.searchChats')} /></label>
    {model.notifications.error && <p role="alert" className="lounge-notification-error">
      {t('client.lounge.notificationSaveFailed')}</p>}
    <div className="lounge-chat-rows">
      {!rows.length && <p className="lounge-no-chats">{t('client.lounge.noChats')}</p>}
      {rows.map((row, index) => <div key={row.id}>
        {(index === 0 || !rows[index - 1].user) && <h2 className="lounge-section-label">
          {t(row.user ? 'client.lounge.privateChats' : 'client.lounge.publicRoom')}</h2>}
        <LoungeSwipeRow enabled={!!row.user && !!model.state.directResetAvailable && model.state.status === 'connected'}
          remove={() => model.setDeleting(row.user)}>
        <MobileLoungeChatTrigger enabled open={() => setMenu(row.id)}>
          <MobileLoungeChatRow row={row} model={model} />
        </MobileLoungeChatTrigger>
        </LoungeSwipeRow>
      </div>)}
    </div>
    {actionRow && <MobileLoungeChatActions row={actionRow} model={model} controller={controller}
      close={() => setMenu(undefined)} />}
  </section>;
}

export function MobileLoungeMembers({ model }: { model: MobileLounge }) {
  const members = model.state.contacts.filter(contact => contact.user.id !== model.state.user?.id);
  return <MobileLoungeSheet title={t('client.lounge.members')} close={() => model.setSheet(undefined)}>
    <p className="lounge-sheet-copy">{t('client.lounge.membersHint')}</p>
    {!members.length && <p className="lounge-sheet-copy">{t('client.lounge.noMembers')}</p>}
    {members.map(contact => <button type="button" key={contact.user.id} className="lounge-chat-row"
      onClick={() => model.setProfile(contact.user)}
      aria-label={t('client.lounge.viewProfile', { account: accountName(contact.user) })}>
      <LoungeAvatar user={contact.user} /><span className="lounge-chat-row-copy">
        <strong>{accountName(contact.user)}</strong>{contact.direct && <small>{t(contactStatus(contact))}</small>}</span>
      <span className="lounge-member-action">{t('client.lounge.profile')}</span>
    </button>)}
  </MobileLoungeSheet>;
}
