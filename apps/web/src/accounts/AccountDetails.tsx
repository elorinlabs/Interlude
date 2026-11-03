import { t, useLanguage } from '../i18n';
import { useEffect, useState } from 'react';
import { Button, SpinLoading, Toast } from 'antd-mobile';
import { RefreshCw } from 'lucide-react';
import { fetchAccountDetails } from '../api';
import { useAppDispatch, useAppSelector } from '../hooks';
import { refreshOneAccount } from '../store';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { AccountDetailsSheet } from '../components/AccountDetailsSheet';
import type { AccountSummary, RemoteDevice } from '../types';
import { AccountInfo } from './AccountInfo';
import { AccountUsage } from './AccountUsage';
import { ResetCredits } from './ResetCredits';
import { useResetCredits } from './useResetCredits';
import { maskEmail } from './formatters';

export function AccountDetails({ account, devices, privateMode, onClose, onUpdated, onSwitch }: {
  account: AccountSummary; devices: RemoteDevice[]; privateMode: boolean;
  onClose: () => void; onUpdated: () => Promise<void>;
  onSwitch: () => void;
}) {
  useLanguage();
  const dispatch = useAppDispatch();
  const refreshing = useAppSelector(s => s.data.refreshing || s.data.consumingQuota
    || Boolean(s.data.refreshingAccountId));
  const [panel, setPanel] = useState<'overview' | 'edit' | 'note' | 'credits'>('overview');
  const [details, setDetails] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const credits = useResetCredits(account.id);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    void fetchAccountDetails(account.id).then(value => {
      if (!cancelled) setDetails(value);
    }).catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [account.id, revision]);
  const current = details ? { ...account, ...details, usage: account.usage, plan: account.plan } : account;
  const active = devices.filter(device => !device.activeProviderId && device.activeAccountId === account.id);
  const refresh = async () => {
    if (refreshing) return;
    void credits.reload();
    try {
      await dispatch(refreshOneAccount(account.id)).unwrap();
      Toast.show({ icon: 'success', content: t("client.accounts.usageRefreshed") });
    } catch { /* The global toast reports the failure. */ }
  };
  const back = () => setPanel('overview');
  return <>
    <AdaptiveSheet open={panel === 'overview'} title={t("client.accounts.accountDetails")} subtitle={t("client.accounts.viewAccountUsageAndSettings")}
      onClose={onClose} width={620}>
      <div className="account-details">
        <div className="account-detail-identity"><span className="account-avatar">
          {account.email.slice(0, 2).toUpperCase()}</span><div>
          <h2>{privateMode ? maskEmail(account.email) : account.email}</h2>
          <p>{active.length ? t("client.accounts.inUseBy", { value1: active.map(device => device.name).join('、') }) : t("client.accounts.noDevicesAreUsingThisAccount")}</p>
          <span className="plan-badge">{account.plan || 'ChatGPT'}</span></div>
          <button type="button" disabled={refreshing} onClick={() => void refresh()} aria-label={t("client.accounts.refreshAccountStatus")}>
            <RefreshCw size={24} className={refreshing ? 'spin' : ''} /><span>{t("client.accounts.refreshStatus")}</span></button></div>
        <AccountUsage usage={account.usage} refreshing={refreshing} onRefresh={() => void refresh()} />
        <Button className="account-detail-switch" color="primary" fill="outline" onClick={onSwitch}>
          {t("client.accounts.switchOnADevice")}</Button>
        {loading ? <div className="sheet-loading"><SpinLoading /><span>{t("client.accounts.loadingAccountDetails")}</span></div>
          : loadError ? <div className="detail-load-error" role="alert"><p>{t("client.accounts.accountDetailsAreUnavailable")}</p>
            <Button size="small" onClick={() => setRevision(value => value + 1)}>{t("client.accounts.reload")}</Button></div>
            : panel === 'overview' && <AccountInfo account={current} credits={credits}
              onEdit={() => setPanel('edit')} onNote={() => setPanel('note')} onCredits={() => setPanel('credits')} />}
      </div>
    </AdaptiveSheet>
    <AccountDetailsSheet account={panel === 'edit' ? current : null} onClose={back} onUpdated={async () => {
      setRevision(value => value + 1); await onUpdated();
    }} />
    <AdaptiveSheet open={panel === 'note'} title={t("client.accounts.accountNotes")} onClose={back} onBack={back} width={400}>
      <p className="account-full-note">{current.note || t("client.accounts.noNotesYet")}</p>
    </AdaptiveSheet>
    {panel === 'credits' && <ResetCredits account={current} state={credits} privateMode={privateMode}
      onBack={back} onUpdated={onUpdated} />}
  </>;
}
