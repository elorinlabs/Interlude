import { useCallback, useEffect, useRef, useState } from 'react';
import {
  activateAccount, beginLogin, cancelAccountLogin, chooseAndImportAccountJson,
  hasLocalBackend, isDesktopApp, refreshAccountUsage, removeAccount, subscribeToBackendEvents,
} from '../api/backend';
import type { Translate } from '../i18n';
import { useAccountDashboard } from './useAccountDashboard';

export function useAccountManager(notify: (message: string) => void, t: Translate) {
  const { accounts, setAccounts, loading, reload } = useAccountDashboard(notify);
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const refreshingAllRef = useRef(false);
  const [loginPending, setLoginPending] = useState(false);
  const loginPendingRef = useRef(false);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!isDesktopApp) return;
    const onFocus = () => { void reload(); };
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, 30_000);
    return () => { window.removeEventListener('focus', onFocus); window.clearInterval(interval); };
  }, [reload]);
  useEffect(() => subscribeToBackendEvents(
    () => void reload(),
    (status) => {
      loginPendingRef.current = false;
      setLoginPending(false);
      notify(status.ok && status.accountId && accountsRef.current.some(account => account.id === status.accountId)
        ? t('accountsOnly.import.mergedLogin')
        : status.message === 'loginTimedOut' ? t('accountsOnly.login.timedOut') : status.message);
      void reload();
    },
  ), [reload, notify, t]);

  const startLogin = useCallback(async (embedded: boolean, privateMode = false) => {
    if (loginPendingRef.current) return;
    if (!isDesktopApp) { notify(t('toast.previewLogin')); return; }
    loginPendingRef.current = true;
    setLoginPending(true);
    notify(t(embedded ? 'toast.openingEmbedded' : 'toast.openingBrowser'));
    try {
      await beginLogin(embedded, privateMode);
      notify(t(embedded ? 'toast.embeddedOpened' : 'toast.browserOpened'));
    } catch (error) {
      loginPendingRef.current = false;
      setLoginPending(false);
      notify(String(error));
    }
  }, [notify, t]);

  const cancelLogin = useCallback(async () => {
    try {
      await cancelAccountLogin();
      loginPendingRef.current = false;
      setLoginPending(false);
    } catch (error) { notify(String(error)); }
  }, [notify]);

  const importAccountJson = useCallback(async () => {
    const existingIds = new Set(accountsRef.current.map(account => account.id));
    notify(t(hasLocalBackend ? 'toast.accountJsonImportPrompt' : 'toast.previewNoFile'));
    try {
      const result = await chooseAndImportAccountJson();
      if (result.status !== 'imported') return;
      const ids = [...new Set(result.ids)];
      const merged = ids.filter(id => existingIds.has(id)).length;
      notify(t('accountsOnly.import.summary', { added: ids.length - merged, merged, skipped: result.skipped.length }));
      await Promise.allSettled(ids.map(id => refreshAccountUsage(id)));
      await reload();
    } catch (error) { notify(String(error)); }
  }, [notify, reload, t]);

  const switchAccount = useCallback(async (id: string) => {
    let activated = false;
    setBusyAccountId(id);
    try {
      await activateAccount(id);
      activated = true;
      if (!hasLocalBackend) setAccounts(items => items.map(item => ({ ...item, active: item.id === id })));
      notify(t('accountsOnly.switched'));
      if (hasLocalBackend) await reload();
      return true;
    } catch (error) {
      const errors = { closeCodex: 'accountsOnly.closeCodex', credentialStore: 'accountsOnly.credentialStore',
        switchFailed: 'accountsOnly.switchFailed' } as const;
      notify(t(errors[String(error) as keyof typeof errors] ?? 'accountsOnly.switchFailed'));
      return activated;
    } finally { setBusyAccountId(null); }
  }, [notify, reload, setAccounts, t]);

  const refreshUsage = useCallback(async (id: string) => {
    setBusyAccountId(id);
    try {
      await refreshAccountUsage(id);
      if (hasLocalBackend) await reload();
      else setAccounts(items => items.map(item => item.id === id
        ? { ...item, usage: { ...item.usage, fetchedAt: new Date().toISOString() } } : item));
      notify(t('toast.usageRefreshed'));
    } catch (error) { notify(String(error)); }
    finally { setBusyAccountId(null); }
  }, [notify, reload, setAccounts, t]);

  const refreshAll = useCallback(async () => {
    if (!accounts.length || refreshingAllRef.current) return;
    refreshingAllRef.current = true;
    setRefreshingAll(true);
    try {
      await Promise.allSettled(accounts.map(account => refreshAccountUsage(account.id)));
      if (hasLocalBackend) await reload();
      else setAccounts(items => items.map(item => ({ ...item, usage: { ...item.usage, fetchedAt: new Date().toISOString() } })));
      notify(t('toast.allUsageRefreshed'));
    } finally { setRefreshingAll(false); refreshingAllRef.current = false; }
  }, [accounts, notify, reload, setAccounts, t]);

  const deleteAccount = useCallback(async (id: string) => {
    try {
      await removeAccount(id);
      if (hasLocalBackend) await reload();
      else setAccounts(items => items.filter(item => item.id !== id));
      notify(t('toast.deleted'));
    } catch (error) { notify(String(error)); }
  }, [notify, reload, setAccounts, t]);

  return { accounts, loading, busyAccountId, refreshingAll, startLogin, loginPending, cancelLogin,
    importAccountJson, switchAccount, refreshUsage, refreshAll, deleteAccount, reload };
}
