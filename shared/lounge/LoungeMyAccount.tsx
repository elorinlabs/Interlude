import { useState } from 'react';
import { Dropdown } from 'antd';
import { ChevronUp, Settings } from 'lucide-react';
import { displayText as t } from '../localization/messages';
import { LoungeAvatar } from './LoungeAvatar';
import { accountName } from './names';
import type { LoungeAccount } from './types';
import './myAccount.css';

export function LoungeMyAccount({ user, settings }: {
  user: LoungeAccount; settings: (user: LoungeAccount) => void;
}) {
  const [open, setOpen] = useState(false);
  return <div className="lounge-my-account">
    <Dropdown trigger={['click']} placement="topLeft" open={open} onOpenChange={setOpen} autoFocus
      overlayClassName="lounge-my-account-menu" overlayStyle={{ maxWidth: 400 }}
      menu={{ items: [{ key: 'settings', label: t('client.lounge.accountSettings'),
        icon: <Settings size={18} aria-hidden="true" /> }],
      onClick: () => { setOpen(false); settings(user); } }}>
      <button type="button" className="lounge-my-account-trigger" aria-label={t('client.lounge.myAccount')}
        aria-haspopup="menu" aria-expanded={open}>
        <LoungeAvatar user={user} />
        <span className="lounge-my-account-copy"><strong>{t('client.lounge.myAccount')}</strong>
          <span>{accountName(user)}</span></span>
        <ChevronUp size={17} aria-hidden="true" />
      </button>
    </Dropdown>
  </div>;
}
