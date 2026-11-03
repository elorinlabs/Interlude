import { t, useLanguage } from '../i18n';
import { useMemo, useState } from 'react';
import { SpinLoading } from 'antd-mobile';
import { ChevronRight, Copy, Eye, EyeOff, Pencil, UserRound } from 'lucide-react';
import type { AccountSummary, TotpEntry } from '../types';
import { copyText } from '../components/copyText';
import { useTotpCodes } from '../totp/useTotpCodes';
import { earliestExpirationDate } from './formatters';
import type { ResetCreditsState } from './useResetCredits';

function InfoRow({ label, value, copy = false, secret = false }: {
  label: string; value?: string | null; copy?: boolean; secret?: boolean;
}) {
  useLanguage();
  const [hidden, setHidden] = useState(true);
  return <div className="account-info-row"><span>{label}</span>
    <strong>{value ? (secret && hidden ? '••••••••' : value) : t("client.accounts.notSet")}</strong>
    {secret && value && <button className="icon-button" type="button" onClick={() => setHidden(v => !v)}
      aria-label={hidden ? t("client.accounts.showPassword") : t("client.accounts.hidePassword")}>{hidden ? <Eye size={17} /> : <EyeOff size={17} />}</button>}
    {copy && value && <button className="icon-button" type="button" aria-label={t("client.accounts.copy", { value1: label })}
      onClick={() => void copyText(label, value)}><Copy size={17} /></button>}
  </div>;
}

function AccountTotp({ secret }: { secret: string }) {
  useLanguage();
  const entries = useMemo<TotpEntry[]>(() => secret ? [{ id: 'preview', secret, issuer: 'ChatGPT',
    accountName: '', algorithm: 'SHA1', digits: 6, period: 30, createdAt: '', updatedAt: '' }] : [], [secret]);
  const { codes, now } = useTotpCodes(entries);
  const code = codes.preview;
  return <div className="account-info-row"><span>2FA</span>
    <button type="button" className="account-inline-code" disabled={!code} aria-label={t("client.accounts.copyCurrentCode")}
      onClick={() => void copyText(t("client.accounts.verificationCode"), code)}>{secret ? (code || t("client.accounts.unavailable")) : t("client.accounts.notSet")}
      {code && <Copy size={16} />}</button>
    {code && <small>{30 - Math.floor(now / 1000) % 30}  {t("client.accounts.s")}</small>}
  </div>;
}

export function AccountInfo({ account, credits, onEdit, onNote, onCredits }: {
  account: AccountSummary; credits: ResetCreditsState;
  onEdit: () => void; onNote: () => void; onCredits: () => void;
}) {
  useLanguage();
  const details = account.privateDetails;
  const expiration = earliestExpirationDate(account.expiresAt, account.usage.apiExpiresAt);
  return <section className="account-detail-section">
    <header><UserRound size={19} /><h3>{t("client.accounts.accountInformation")}</h3><button className="icon-button" type="button"
      aria-label={t("client.accounts.editAccountInformation")} onClick={onEdit}><Pencil size={20} /></button></header>
    <InfoRow label={t("client.accounts.plan")} value={account.plan || 'ChatGPT'} />
    <InfoRow label={t("client.accounts.expires")} value={expiration} />
    {account.expiresAt && expiration !== account.expiresAt && <InfoRow label={t("client.accounts.presetEndDate")} value={account.expiresAt} />}
    <InfoRow label={t("client.accounts.accountId")} value={account.accountId} copy />
    <InfoRow label={t("client.accounts.phoneNumber")} value={details?.phoneNumber} copy />
    <InfoRow label={t("client.accounts.password")} value={details?.password} secret copy />
    <AccountTotp secret={details?.totpSecret ?? ''} />
    <button type="button" className="account-info-row" onClick={onNote} aria-label={t("client.accounts.viewFullNote")}>
      <span>{t("client.accounts.notes")}</span><strong className="truncate">{account.note || t("client.accounts.notSet")}</strong><ChevronRight size={17} /></button>
    <button type="button" className="account-info-row" onClick={onCredits} aria-label={t("client.accounts.viewResetCredits")}>
      <span>{t("client.accounts.resetCredits")}</span><strong>{credits.loading ? <SpinLoading style={{ '--size': '16px' }} />
        : credits.credits ? t("client.accounts.credits", { value1: credits.credits.length }) : t("client.accounts.unavailable")}</strong><ChevronRight size={17} /></button>
  </section>;
}
