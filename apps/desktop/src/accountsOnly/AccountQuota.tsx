import type { UsageWindow } from '../types';
import type { Translate } from '../i18n';

export function AccountQuota({ window, fallback, t }: {
  window: UsageWindow | null | undefined;
  fallback: 'table.fiveHours' | 'table.oneWeek';
  t: Translate;
}) {
  const raw = window?.remainingPercent;
  const value = raw != null && Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : null;
  const minutes = window?.windowMinutes;
  let label = t(fallback);
  if (minutes != null && Number.isFinite(minutes) && minutes > 0) {
    label = minutes % 1440 === 0 ? t('accountsOnly.quota.days', { count: minutes / 1440 })
      : minutes % 60 === 0 ? t('accountsOnly.quota.hours', { count: minutes / 60 })
        : t('accountsOnly.quota.minutes', { count: minutes });
  }
  const level = value == null ? 'unknown' : value <= 10 ? 'critical' : value <= 25 ? 'low' : 'available';
  const resetAt = window?.resetsAt && Number.isFinite(window.resetsAt) ? new Date(window.resetsAt * 1000) : null;
  const resetLabel = resetAt && Number.isFinite(resetAt.getTime())
    ? resetAt.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  return <div className={`account-quota quota-${level}`} role="group" aria-label={label}>
    <div className="quota-heading"><span>{label}</span><small>{t('usage.remaining')}</small></div>
    <strong className="quota-value">{value ?? '—'}{value != null && <small>%</small>}</strong>
    <div className="quota-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={value??undefined} aria-valuetext={value==null?'—':`${value}%`}>
      {value != null && <span style={{ width: `${value}%` }} />}
    </div>
    {resetLabel && <small className="quota-reset-time">{t('accountsOnly.antigravity.reset', { time: resetLabel })}</small>}
  </div>;
}
