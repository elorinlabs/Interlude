import { t, useLanguage } from '../i18n';
import { Tooltip } from 'antd';
import { ChartNoAxesColumn, CircleHelp, Clock3, RefreshCw } from 'lucide-react';
import type { UsageSummary, UsageWindow } from '../types';
import { displayDate, remainingPercent, resetLabel, usageErrorLabel, usageTone } from './formatters';

function UsageMeter({ title, usage, secondary }: { title: string; usage?: UsageWindow | null; secondary?: boolean }) {
  useLanguage();
  const remaining = remainingPercent(usage?.remainingPercent);
  return <div className={`detail-meter quota-${usageTone(remaining)} ${secondary ? 'secondary' : ''}`}>
    <div><strong>{title}</strong><Tooltip trigger={['hover', 'click', 'focus']}
      title={t("client.accounts.viewRemainingQuotaAndResetTimesUsageWindowsVaryBy")}>
      <button type="button" className="icon-button" aria-label={t("client.accounts.about", { value1: title })}><CircleHelp size={15} /></button>
    </Tooltip><b>{remaining === null ? '--' : `${remaining}%`}</b><span>{t("client.accounts.remaining")}</span></div>
    <div className="quota-track" role="progressbar" aria-label={t("client.accounts.remainingQuota.8e22d4", { value1: title })} aria-valuemin={0}
      aria-valuemax={100} aria-valuenow={remaining ?? undefined}
      aria-valuetext={remaining === null ? t("client.accounts.usageUnavailable") : `${remaining}%`}>
      <i style={{ width: `${remaining ?? 0}%` }} /></div>
    <p><Clock3 size={14} />{usage ? resetLabel(usage.resetsAt) : t("client.accounts.usageUnavailable")}</p>
  </div>;
}

export function AccountUsage({ usage, refreshing, onRefresh }: {
  usage: UsageSummary; refreshing: boolean; onRefresh: () => void;
}) {
  useLanguage();
  return <section className="account-detail-section">
    <header><ChartNoAxesColumn size={19} /><h3>{t("client.accounts.usage")}</h3><small>{t("client.accounts.updated")} {displayDate(usage.fetchedAt)}</small>
      <button className="icon-button" type="button" disabled={refreshing} onClick={onRefresh}
        aria-label={t("client.accounts.refreshAccountUsage")}><RefreshCw size={18} className={refreshing ? 'spin' : ''} /></button></header>
    <UsageMeter title={t("client.accounts.primaryUsageWindow")} usage={usage.primary} />
    <UsageMeter title={t("client.accounts.secondaryUsageWindow")} usage={usage.secondary} secondary />
    {usage.error && <p className="account-row-error">{usageErrorLabel(usage.error)}</p>}
  </section>;
}
