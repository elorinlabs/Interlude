import { t, useLanguage } from '../i18n';
import { useRef, useState } from 'react';
import { Button, Dialog, Empty, SpinLoading, Toast } from 'antd-mobile';
import { RefreshCw } from 'lucide-react';
import { consumeResetCredit } from '../api';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import type { AccountSummary } from '../types';
import { displayFullDate, maskEmail } from './formatters';
import type { ResetCreditsState } from './useResetCredits';

export function ResetCredits({ account, state, privateMode, onBack, onUpdated }: {
  account: AccountSummary; state: ResetCreditsState; privateMode: boolean;
  onBack: () => void; onUpdated: () => Promise<void>;
}) {
  useLanguage();
  const [consuming, setConsuming] = useState(false);
  const busy = useRef(false);
  const useCredit = async () => {
    if (busy.current || !state.credits?.length) return;
    busy.current = true;
    const confirmed = await Dialog.confirm({ title: t("client.accounts.useAResetCredit"),
      content: t("client.accounts.useOneResetCreditToRestoreTheQuotaEligibleFor"), confirmText: t("client.accounts.useResetCredit"), cancelText: t("client.accounts.cancel") });
    if (!confirmed) { busy.current = false; return; }
    setConsuming(true);
    try {
      await consumeResetCredit(account.id);
      Toast.show({ icon: 'success', content: t("client.accounts.resetCreditUsed") });
      await Promise.all([state.reload(), onUpdated()]);
    } catch {
      Toast.show({ icon: 'fail', content: t("client.accounts.couldNotUseTheCreditPleaseTryAgainLater") });
    } finally { busy.current = false; setConsuming(false); }
  };
  const close = () => { if (!busy.current) onBack(); };
  return <AdaptiveSheet open title={t("client.accounts.resetCredits.277d04")} onClose={close} onBack={close}
    subtitle={privateMode ? maskEmail(account.email) : account.email}>
    <div className="reset-credit-summary"><span>{t("client.accounts.availableNow")}</span>
      <strong>{state.loading || state.error ? '—' : state.credits?.length ?? 0}<small>  {t("client.accounts.credits.f56a04")}</small></strong></div>
    {state.loading ? <div className="sheet-loading"><SpinLoading /><span>{t("client.accounts.loadingResetCredits")}</span></div>
      : state.error ? <div className="detail-load-error" role="alert"><p>{t("client.accounts.couldNotLoadResetCreditsPleaseTryAgainLater")}</p>
        <Button size="small" onClick={() => void state.reload()}>{t("client.accounts.reload")}</Button></div>
        : !state.credits?.length ? <Empty description={t("client.accounts.noResetCreditsAvailable")} />
          : <div className="reset-credit-list">{state.credits.map((credit, index) =>
            <article key={`${credit.expiresAt}-${index}`}><header><RefreshCw size={20} />
              <strong>{t("client.accounts.resetCredits")} {index + 1}</strong><span>{t("client.accounts.available")}</span></header>
              <p><span>{t("client.accounts.issued")}</span>{displayFullDate(credit.issuedAt)}</p>
              <p><span>{t("client.accounts.expires")}</span>{displayFullDate(credit.expiresAt)}</p></article>)}</div>}
    <Button block color="primary" loading={consuming} disabled={state.loading || state.error || !state.credits?.length}
      onClick={() => void useCredit()}>{t("client.accounts.useResetCredit")}</Button>
  </AdaptiveSheet>;
}
