import { useState } from 'react';
import { Button, Toast } from 'antd-mobile';
import { Checkbox } from 'antd';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { useAppDispatch, useAppSelector } from '../hooks';
import { t, useLanguage } from '../i18n';
import { consumeQuota } from '../store';
import type { AccountSummary } from '../types';
import { maskEmail, remainingPercent, resetLabel } from './formatters';
import './quotaConsumption.css';

export function QuotaConsumptionSheet({ accounts, privateMode, deviceName, onClose }: {
  accounts: AccountSummary[]; privateMode: boolean; deviceName: string; onClose: () => void;
}) {
  useLanguage();
  const dispatch = useAppDispatch();
  const busy = useAppSelector(state => state.data.consumingQuota);
  const [selectedIds, setSelectedIds] = useState(() => accounts.map(account => account.id));
  const selected = accounts.filter(account => selectedIds.includes(account.id));
  const allSelected = selected.length === accounts.length;
  const close = () => { if (!busy) onClose(); };
  const confirm = async () => {
    if (busy || !selected.length) return;
    try {
      const result = await dispatch(consumeQuota(selected.map(account => account.id))).unwrap();
      Toast.show({ icon: result.failed ? 'fail' : 'success', content: result.failed
        ? t("client.accountUsage.consumedQuotaForAccountsAccountsNeedAttentionCheckTheirUsage",
          { count: result.consumed, failed: result.failed })
        : t("client.accountUsage.consumedQuotaForAccountsAndUpdatedTheirUsage", { count: result.consumed }) });
      onClose();
    } catch { /* The global toast reports connection failures. */ }
  };
  return <AdaptiveSheet open title={t("client.mobile.chooseAccountsToConsumeQuota")} width={440}
    subtitle={t("client.mobile.selectedAccounts", { value1: selected.length, value2: accounts.length })}
    onClose={close}>
    <div className="quota-consumption">
      <div className="quota-consumption-notice">
        <strong>{t("client.mobile.thisActionUsesRealQuota")}</strong>
        <p>{t("client.accountUsage.willAskEachSelectedAccountHowIsTheWeatherToday", { device: deviceName })}</p>
      </div>
      <Checkbox className="quota-select-all" checked={allSelected} disabled={busy}
        onChange={event => setSelectedIds(event.target.checked ? accounts.map(account => account.id) : [])}>
        {allSelected ? t("client.mobile.deselectAll") : t("client.mobile.selectAllAvailableAccounts")}
      </Checkbox>
      <div className="quota-consumption-list">
        {accounts.map(account => {
          const remaining = remainingPercent(account.usage.primary?.remainingPercent);
          const email = privateMode ? maskEmail(account.email) : account.email;
          return <Checkbox key={account.id} checked={selectedIds.includes(account.id)} disabled={busy}
            onChange={event => setSelectedIds(ids => event.target.checked
              ? [...ids, account.id] : ids.filter(id => id !== account.id))}>
            <span className="quota-consumption-identity"><strong>{email}</strong>
              <small>{account.plan || 'ChatGPT'} · {remaining === null ? t("client.mobile.primaryQuotaUnavailable")
                : t("client.mobile.primaryQuotaRemaining", { value1: remaining })}</small>
              <small>{resetLabel(account.usage.primary?.resetsAt)}</small></span>
          </Checkbox>;
        })}
      </div>
      <div className="quota-consumption-actions">
        <Button disabled={busy} onClick={close}>{t("client.accounts.cancel")}</Button>
        <Button color="danger" disabled={busy || !selected.length} loading={busy} onClick={() => void confirm()}>
          {selected.length ? t("client.mobile.consumeQuotaForSelectedAccounts", { value1: selected.length }) : t("client.mobile.selectAnAccountFirst")}
        </Button>
      </div>
    </div>
  </AdaptiveSheet>;
}
