import { Button, Empty, Spin } from 'antd';
import { ArrowUpRight, Check, KeyRound, RefreshCw, ShieldCheck, Trash2, Wrench } from 'lucide-react';
import type { Account, AccountHealth } from '../types';
import type { Translate } from '../i18n';
import { AccountQuota } from './AccountQuota';

interface AccountListProps {
  accounts: Account[];
  loading: boolean;
  busyId: string | null;
  searching: boolean;
  t: Translate;
  onAdd: () => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: (id: string) => void;
  health: Record<string, AccountHealth>;
  checkingId: string | null;
  onCheck: (id: string) => void;
  onRepair: (id: string) => void;
  onConfigureRecovery?: (account: Account) => void;
}

export function AccountList(props: AccountListProps) {
  const { accounts, loading, busyId, searching, t, onAdd, onSwitch, onDelete, onRefresh } = props;
  if (loading) return <div className="accounts-empty" role="status"><Spin />{t('accounts.loading')}</div>;
  if (!accounts.length) return <div className="accounts-empty">
    <Empty description={t(searching ? 'accountsOnly.noResults' : 'accounts.empty.title')}>
      {!searching && <Button type="primary" onClick={onAdd}>{t('accounts.empty.addFirst')}</Button>}
    </Empty>
  </div>;

  return <ul className="account-ledger">
    {[...accounts].sort((a,b)=>Number(b.active)-Number(a.active)).map((account, index) => <li key={account.id}
      className={`account-entry${account.active ? ' active-account' : ''}`}>
      <div className="account-identity"><span className={`account-avatar avatar-${index % 4}`} aria-hidden="true">
        {account.email.slice(0, 1).toUpperCase()}
      </span><div className="account-name"><div className="account-name-line"><strong>{account.email}</strong>
        {account.active&&<span className="account-current"><Check size={12}/>{t('table.inUse')}</span>}
        <span className="account-plan">{account.plan || '—'}</span></div>
        <div className="account-secondary" title={account.note || account.group || t('table.personal')}>{account.note || account.group || t('table.personal')}</div>
        <div className={`account-health health-${props.health[account.id]?.status ?? 'unchecked'}`}
          title={t(`accountsOnly.health.${props.health[account.id]?.status ?? 'unchecked'}Hint`)}>
          <span aria-hidden="true" />
          {t(`accountsOnly.health.${props.health[account.id]?.status ?? 'unchecked'}`)}
          {['needsLogin', 'refreshNeeded'].includes(props.health[account.id]?.status ?? '') &&
            <button className="reauthorize-button" disabled={busyId !== null} onClick={() => props.onRepair(account.id)}>
              {t('accountsOnly.health.reauthorize')}
            </button>}
        </div>
      </div></div>
      <div className="account-quotas">
        <AccountQuota window={account.usage.primary} fallback="table.fiveHours" t={t} />
        <AccountQuota window={account.usage.secondary} fallback="table.oneWeek" t={t} />
      </div>
      <div className="account-actions">
        {!account.active && <Button className="switch-button" icon={<ArrowUpRight size={15} />} disabled={busyId !== null}
            onClick={() => onSwitch(account.id)}>{t('accountsOnly.switch')}</Button>}
        <div className="account-utilities">
        {props.onConfigureRecovery&&<Button type="text" icon={<KeyRound size={15}/>} disabled={busyId!==null}
          aria-label={t('accountsOnly.recovery.settings')} title={t('accountsOnly.recovery.settings')}
          onClick={()=>props.onConfigureRecovery?.(account)}/>}
        {['needsLogin', 'refreshNeeded', 'checkFailed'].includes(props.health[account.id]?.status ?? '') && <Button type="text" icon={<Wrench size={15} />}
          disabled={busyId !== null} aria-label={t('accountsOnly.health.reauthorize')} title={t('accountsOnly.health.reauthorize')}
          onClick={() => props.onRepair(account.id)} />}
        <Button type="text" icon={<ShieldCheck size={15} />} loading={props.checkingId === account.id}
          disabled={busyId !== null || props.checkingId !== null}
          aria-label={`${t('accountsOnly.health.check')} ${account.email}`}
          title={t('accountsOnly.health.check')}
          onClick={() => props.onCheck(account.id)} />
        <Button type="text" icon={<RefreshCw size={15} />} loading={busyId === account.id}
          disabled={busyId !== null} aria-label={`${t('table.refreshUsage')} ${account.email}`}
          onClick={() => onRefresh(account.id)} />
        <Button type="text" danger icon={<Trash2 size={15} />} disabled={account.active || busyId !== null}
          aria-label={`${t('table.deleteAccount')} ${account.email}`} onClick={() => onDelete(account.id)} />
        </div>
      </div>
    </li>)}
  </ul>;
}
