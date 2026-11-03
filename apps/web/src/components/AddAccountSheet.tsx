import { t, useLanguage } from '../i18n';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Button, Dialog, SpinLoading, Toast } from 'antd-mobile';
import { ClipboardPaste, FileInput, KeyRound, Link2 } from 'lucide-react';
import { importPersonalAccounts, pollAccountOAuth, startAccountOAuth } from '../api';
import type { AccountImportResult } from '../types';
import { AdaptiveSheet } from './AdaptiveSheet';

interface AddAccountSheetProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => Promise<void>;
}

interface OAuthState {
  sessionId: string;
  verificationUrl: string;
  userCode: string;
  interval: number;
}

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

function resultMessage(result: AccountImportResult) {
  return result.skippedCount
    ? t("client.app.importedAccountsSkipped", { value1: result.importedCount, value2: result.skippedCount })
    : t("client.app.importedAccounts", { value1: result.importedCount });
}

export function AddAccountSheet({ open, onClose, onAdded }: AddAccountSheetProps) {
  useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [oauth, setOauth] = useState<OAuthState | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) setOauth(null);
  }, [open]);

  useEffect(() => {
    if (!oauth) return undefined;
    let running = false;
    const poll = async () => {
      if (running) return;
      running = true;
      try {
        const result = await pollAccountOAuth(oauth.sessionId);
        if (result.status === 'complete') {
          Toast.show({ icon: 'success', content: t("client.app.accountAdded") });
          setOauth(null);
          onClose();
          await onAdded();
        } else if (result.status === 'failed') {
          Toast.show({ icon: 'fail', content: result.message || t("client.app.authorizationFailedPleaseTryAgain") });
          setOauth(null);
        }
      } catch (error) {
        Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : t("client.app.couldNotCheckAuthorization") });
      } finally {
        running = false;
      }
    };
    const timer = window.setInterval(() => void poll(), Math.max(oauth.interval, 2) * 1000);
    void poll();
    return () => window.clearInterval(timer);
  }, [oauth, onAdded, onClose]);

  const importContent = async (content: string) => {
    if (!content.trim()) throw new Error(t("client.app.noJsonContentFound"));
    if (new Blob([content]).size > MAX_IMPORT_BYTES) throw new Error(t("client.app.importFilesMustBeUnder5Mb"));
    setImporting(true);
    try {
      const result = await importPersonalAccounts(content);
      Toast.show({ icon: 'success', content: resultMessage(result) });
      if (result.skipped.length) {
        await Dialog.alert({ title: t("client.app.someAccountsWereNotImported"), content: result.skipped.slice(0, 3).join('\n'), confirmText: t("client.app.gotIt") });
      }
      onClose();
      await onAdded();
    } catch (error) {
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : t("client.app.importFailedCheckTheJsonContent") });
    } finally {
      setImporting(false);
    }
  };

  const chooseFile = () => fileRef.current?.click();
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await importContent(await file.text());
  };

  const pasteClipboard = async () => {
    try { await importContent(await navigator.clipboard.readText()); }
    catch (error) { Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : t("client.app.couldNotReadTheClipboard") }); }
  };

  const beginOAuth = async () => {
    setBusy(true);
    try { setOauth(await startAccountOAuth()); }
    catch (error) { Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : t("client.app.couldNotStartAuthorization") }); }
    finally { setBusy(false); }
  };

  return <AdaptiveSheet open={open} title={t("client.accounts.addAccount")} subtitle={t("client.app.chooseASecureImportMethod")} onClose={onClose}>
    {oauth ? <div className="oauth-import-panel">
      <div className="oauth-import-icon"><KeyRound size={22} /></div>
      <h3>{t("client.app.authorizeWithChatgpt")}</h3>
      <p>{t("client.app.openTheAuthorizationPageAndEnterTheOneTimeCode")}</p>
      <a className="oauth-link" href={oauth.verificationUrl} target="_blank" rel="noreferrer"><Link2 size={15} />{t("client.app.openAuthorizationPage")}</a>
      <div className="oauth-code-value">{oauth.userCode}</div>
      <Button block onClick={() => void navigator.clipboard.writeText(oauth.userCode)}>{t("client.app.copyCode")}</Button>
      <div className="sheet-loading"><SpinLoading color="primary" /><span>{t("client.app.waitingForAuthorization")}</span></div>
    </div> : <>
      <div className="add-account-options">
        <button type="button" disabled={busy || importing} onClick={() => void beginOAuth()}><KeyRound size={20} /><span><strong>{t("client.app.chatgptAuthorization")}</strong><small>{t("client.app.signInSecurelyWithYourBrowser")}</small></span></button>
        <button type="button" disabled={busy || importing} onClick={chooseFile}><FileInput size={20} /><span><strong>{t("client.app.importJsonFile")}</strong><small>{t("client.app.supportsAuthJsonAndCompatibleExports")}</small></span></button>
        <button type="button" disabled={busy || importing} onClick={() => void pasteClipboard()}><ClipboardPaste size={20} /><span><strong>{t("client.app.importFromClipboard")}</strong><small>{t("client.app.pasteYourAccountJsonContent")}</small></span></button>
      </div>
      <input ref={fileRef} hidden type="file" accept=".json,application/json,text/plain" onChange={(event) => void handleFile(event)} />
    </>}
  </AdaptiveSheet>;
}
