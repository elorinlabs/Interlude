import { t, useLanguage } from '../i18n';
import { Button } from 'antd-mobile';
import { Clock3, Eye, EyeOff, Laptop, Plus, RefreshCw, Users, Zap } from 'lucide-react';
import { displayDate } from './formatters';

export function AccountOverview({ count, online, privateMode, refreshing, consuming, busy,
  updatedAt, onPrivacy, onRefresh, onConsume, onAdd }: {
  count: number; online: number; privateMode: boolean; refreshing: boolean; updatedAt: number | null;
  consuming: boolean; busy: boolean;
  onPrivacy: () => void; onRefresh: () => void; onConsume: () => void; onAdd: () => void;
}) {
  useLanguage();
  return <>
    <section className="accounts-overview">
      <header><h1>{t("client.accounts.accounts")}</h1><button className="icon-button" type="button" onClick={onPrivacy}
        aria-label={privateMode ? t("client.accounts.showAccountEmails") : t("client.accounts.hideAccountEmails")} aria-pressed={privateMode}>
        {privateMode ? <EyeOff size={20} /> : <Eye size={20} />}</button></header>
      <div className="accounts-overview-stats">
        <div className="accounts-stat"><Users size={26} /><span><b>{count}</b><small>{t("client.accounts.accounts.5088a9")}</small></span></div>
        <div className="accounts-stat"><Laptop size={26} /><span><b>{online}</b><small>{t("client.accounts.onlineDevices")}</small></span></div>
        <div className="accounts-overview-actions">
          <Button className="accounts-consume" loading={consuming} disabled={!count || busy} onClick={onConsume}
            aria-label={t("client.mobile.consumeQuota")}><Zap size={23} /><span>{t("client.mobile.consumeQuota")}</span></Button>
          <Button color="primary" loading={refreshing} disabled={!count || busy} onClick={onRefresh}
          aria-label={t("client.accounts.refreshAllUsage")}>
          <RefreshCw size={18} /><span>{t("client.accounts.refreshAllUsage")}</span></Button>
        </div>
      </div>
    </section>
    <div className="accounts-toolbar"><span><Clock3 size={16} />{t("client.accounts.usageUpdated")}{updatedAt ? displayDate(new Date(updatedAt).toISOString()) : t("client.accounts.notRefreshed")}</span>
      <Button fill="none" color="primary" onClick={onAdd}><Plus size={20} />{t("client.accounts.addAccount")}</Button>
    </div>
  </>;
}
