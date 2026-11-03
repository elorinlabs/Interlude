import { t, useLanguage } from '../i18n';
import { useEffect, useState } from 'react';
import { Button, Form, Input, SpinLoading, Toast } from 'antd-mobile';
import { Eye, EyeOff, Save } from 'lucide-react';
import { fetchAccountDetails, updateAccountDetails } from '../api';
import type { AccountPrivateDetails, AccountSummary } from '../types';
import { AdaptiveSheet } from './AdaptiveSheet';

interface AccountDetailsSheetProps {
  account: AccountSummary | null;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}

const EMPTY_PRIVATE_DETAILS: AccountPrivateDetails = { password: '', phoneNumber: '', totpSecret: '' };

export function AccountDetailsSheet({ account, onClose, onUpdated }: AccountDetailsSheetProps) {
  useLanguage();
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [privateDetails, setPrivateDetails] = useState(EMPTY_PRIVATE_DETAILS);
  const [hidden, setHidden] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setNote(account.note);
    setExpiresAt(account.expiresAt);
    setPrivateDetails(account.privateDetails ?? EMPTY_PRIVATE_DETAILS);
    setHidden(true);
    setLoading(true);
    setLoadError(false);
    void fetchAccountDetails(account.id).then((details) => {
      if (cancelled) return;
      setNote(details.note);
      setExpiresAt(details.expiresAt);
      setPrivateDetails(details.privateDetails ?? EMPTY_PRIVATE_DETAILS);
    }).catch((error) => {
      if (cancelled) return;
      setLoadError(true);
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : t("client.app.couldNotLoadAccountDetails") });
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [account?.id, revision]);

  const save = async () => {
    if (!account || saving || loading || loadError) return;
    setSaving(true);
    try {
      await updateAccountDetails(account.id, { note, expiresAt, privateDetails });
      Toast.show({ icon: 'success', content: t("client.app.accountInformationSaved") });
      onClose();
      await onUpdated();
    } catch (error) {
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : t("client.app.couldNotSaveAccountInformation") });
    } finally {
      setSaving(false);
    }
  };

  return <AdaptiveSheet open={Boolean(account)} title={t("client.accounts.editAccountInformation")} onBack={() => { if (!saving) onClose(); }}
    onClose={() => { if (!saving) onClose(); }}>
    {loading ? <div className="sheet-loading"><SpinLoading color="primary" /><span>{t("client.app.loadingAccountDetails")}</span></div>
      : loadError ? <div className="detail-load-error" role="alert"><p>{t("client.accounts.accountDetailsAreUnavailable")}</p>
        <Button onClick={() => setRevision(value => value + 1)}>{t("client.accounts.reload")}</Button></div>
        : <Form layout="vertical" className="account-details-form" footer={<Button block color="primary"
          size="large" loading={saving} onClick={() => void save()}><Save size={16} />{t("client.app.saveAccountInformation")}</Button>}>
      <Form.Item label={t("client.accounts.alias")} help={t("client.accounts.aliasHint")}>
        <Input value={privateDetails.alias ?? ''} maxLength={16} clearable
          aria-label={t("client.accounts.alias")} placeholder={t("client.accounts.aliasPlaceholder")}
          onChange={alias => setPrivateDetails(current => ({ ...current, alias }))} />
      </Form.Item>
      <Form.Item label={t("client.accounts.accountNotes")}><Input value={note} onChange={setNote} placeholder={t("client.app.addANote")} clearable /></Form.Item>
      <Form.Item label={t("client.accounts.expires")}><Input value={expiresAt} onChange={setExpiresAt} placeholder={t("client.app.forExample20261231")} clearable /></Form.Item>
      <Form.Item label={t("client.accounts.password")}><div className="secret-input-row"><Input type={hidden ? 'password' : 'text'} value={privateDetails.password} onChange={(value) => setPrivateDetails((current) => ({ ...current, password: value }))} placeholder={t("client.app.optional")} /><button type="button" onClick={() => setHidden((value) => !value)} aria-label={hidden ? t("client.accounts.showPassword") : t("client.accounts.hidePassword")}>{hidden ? <Eye size={17} /> : <EyeOff size={17} />}</button></div></Form.Item>
      <Form.Item label={t("client.accounts.phoneNumber")}><Input value={privateDetails.phoneNumber} onChange={(value) => setPrivateDetails((current) => ({ ...current, phoneNumber: value }))} placeholder={t("client.app.optional")} clearable /></Form.Item>
      <Form.Item label={t("client.app.2faKeys")}><Input value={privateDetails.totpSecret} onChange={(value) => setPrivateDetails((current) => ({ ...current, totpSecret: value.toUpperCase() }))} placeholder={t("client.app.optional")} clearable /></Form.Item>
    </Form>}
  </AdaptiveSheet>;
}
