import { displayError } from '../i18n/index';
import { getLocale, t, useLanguage } from '../i18n';
import { useMemo, useState } from 'react';
import type { TokenSummary } from '../../../../shared/remote-chat/tokenSummary';
import { buildQuotaChartData, type QuotaInterval, type QuotaView }
  from '../../../desktop/src/components/TokenUsageDashboard/quotaHistoryData';
import { quotaChartLabels } from '../../../desktop/src/components/TokenUsageDashboard/quotaChartLabels';
import { formatTokens } from '../../../../shared/remote-chat/usage';

interface Point { label: string; values: Array<number | null> }
const COLORS = ['#14806f', '#a78bfa', '#f59e0b', '#4b96c7', '#e57f93'];

export function TokenBars({ points, labels, unit }: { points: Point[]; labels: string[]; unit?: string }) {
  useLanguage();
  const [selected, setSelected] = useState<number | null>(null);
  const maximum = Math.max(1, ...points.flatMap(point => point.values.map(value => value ?? 0)));
  const point = points[Math.min(selected ?? points.length - 1, points.length - 1)];
  return <div className="chat-token-chart">
    <div className="chat-token-bars" role="group" aria-label={t("client.chat.chooseADateToViewUsage")}>{points.map((point, index) =>
      <button key={`${point.label}:${index}`} type="button" title={point.label} aria-label={point.label}
        aria-pressed={selected === index} onClick={() => setSelected(index)}>
        {point.values.map((value, position) => <span key={position} style={{
          height: value === null ? 0 : `${Math.max(value > 0 ? 1 : 0, value / maximum * 100)}%`,
          background: COLORS[position % COLORS.length],
        }} />)}</button>)}</div>
    <div className="chat-token-dates"><span>{points[0]?.label}</span><span>{points.at(-1)?.label}</span></div>
    {point && <div className="chat-token-legend"><strong>{point.label}</strong>{labels.map((label, index) =>
      <span key={label}><i style={{ background: COLORS[index % COLORS.length] }} />{label}：
        {point.values[index] == null ? '—' : unit ? `${point.values[index]!.toFixed(1)}${unit}`
          : formatTokens(point.values[index]!)}</span>)}</div>}
  </div>;
}

export function TokenQuota({ data }: { data: TokenSummary }) {
  const language = useLanguage();
  const [accountId, setAccountId] = useState('');
  const [interval, setInterval] = useState<QuotaInterval>('sixHours');
  const [view, setView] = useState<QuotaView>('drop');
  const selected = data.quotaHistory.find(account => account.accountId === accountId) ?? data.quotaHistory[0];
  const labels = quotaChartLabels(language);
  const chart = useMemo(() => buildQuotaChartData({ points: selected?.points ?? [],
    startTs: data.startTs, endTs: data.endTs, interval, view }), [selected, data.startTs, data.endTs, interval, view]);
  const primary = new Map(chart.primary);
  const secondary = new Map(chart.secondary);
  const points = [...new Set([...primary.keys(), ...secondary.keys()])].sort((a, b) => a - b).map(ts => ({
    label: new Date(ts).toLocaleString(getLocale()), values: [primary.get(ts) ?? null, secondary.get(ts) ?? null],
  }));
  return <section className="chat-token-card"><h3>{labels.title}</h3>
    <div className="chat-token-controls"><select aria-label={t("client.chat.chooseQuotaAccount")} value={selected?.accountId ?? ''}
      onChange={event => setAccountId(event.target.value)}>{!selected && <option value="">{labels.noAccounts}</option>}
      {data.quotaHistory.map(account => <option key={account.accountId} value={account.accountId}>
        {account.accountLabel}</option>)}</select>
      <select aria-label={t("client.chat.quotaDisplay")} value={view} onChange={event => setView(event.target.value as QuotaView)}>
        <option value="drop">{t("client.chat.usagePerPeriod")}</option><option value="remaining">{t("client.accounts.remainingQuota")}</option></select>
      <select aria-label={t("client.chat.quotaInterval")} value={interval}
        onChange={event => setInterval(event.target.value as QuotaInterval)}>
        <option value="hour">{t("client.chat.hourly")}</option><option value="sixHours">{t("client.chat.every6Hours")}</option><option value="day">{t("client.chat.daily")}</option>
      </select></div>
    {data.errors.quota ? <p className="chat-error">{displayError(labels.error)}</p> : chart.hasData
      ? <TokenBars points={points} labels={[labels.primary, labels.secondary]} unit={view === 'drop' ? t("client.chat.pp") : '%'} />
      : <p className="chat-muted">{labels.empty}</p>}
    <p className="chat-muted">{view === 'drop' ? labels.dropHint : t("client.chat.showsRemainingQuotaAtEachRefreshPeriodsWithoutRecordsAre")}</p>
    <p className="chat-muted">{labels.historyHint}</p>
  </section>;
}
