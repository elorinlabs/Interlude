import { useCallback, useEffect, useRef, useState } from 'react';
import { checkAccountHealth, loadAccountHealth } from '../api/backend';
import type { Account, AccountHealth } from '../types';
import type { Translate } from '../i18n';

export function useAccountHealth(accounts: Account[], notify: (message: string) => void, t: Translate,
  onNeedsLogin?: (id: string) => void) {
  const HEALTH_REFRESH_INTERVAL = 10 * 60_000;
  const recover = useRef(onNeedsLogin);
  recover.current = onNeedsLogin;
  const [health, setHealth] = useState<Record<string, AccountHealth>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{done:number;total:number} | null>(null);
  const checking = useRef(false);
  // A reload after OAuth/refresh invalidates cached observations even when account IDs are unchanged.
  useEffect(() => {
    let active = true;
    let loading = false;
    const read = async () => {
      if (loading || checking.current) return;
      loading = true;
      try {
        const value = await loadAccountHealth(accounts.map((account) => account.id));
        if (active && !checking.current) {
          setHealth(value);
          Object.entries(value).forEach(([id,result])=>{
            if(result.status==='needsLogin')recover.current?.(id);
          });
        }
      } catch { if (active) notify(t('accountsOnly.health.loadFailed')); }
      finally { loading = false; }
    };
    void read();
    const timer = window.setInterval(() => void read(), HEALTH_REFRESH_INTERVAL);
    return () => { active = false; window.clearInterval(timer); };
  }, [accounts, notify, t]);

  const check = useCallback(async (id: string) => {
    if (checking.current) return;
    checking.current = true; setCheckingId(id);
    try {
      const value = await checkAccountHealth(id);
      setHealth((current) => ({ ...current, [id]: value }));
      if(value.status==='needsLogin')recover.current?.(id);
    } catch (error) {
      notify(t(String(error) === 'accountHealthBusy'
        ? 'accountsOnly.health.busy' : 'accountsOnly.health.loadFailed'));
    } finally { checking.current = false; setCheckingId(null); }
  }, [notify, t]);
  const repair = useCallback((id: string) => {
    recover.current?.(id);
  }, []);
  const checkAll = useCallback(async () => {
    if (checking.current || !accounts.length) return;
    const ids = [...new Set(accounts.map(account => account.id))];
    const needsLogin:string[]=[];
    checking.current = true;
    setProgress({ done: 0, total: ids.length });
    try {
      for (let index = 0; index < ids.length; index++) {
        const id = ids[index]; setCheckingId(id);
        try {
          const value = await checkAccountHealth(id);
          setHealth(current => ({ ...current, [id]: value }));
          if(value.status==='needsLogin')needsLogin.push(id);
        } catch {
          setHealth(current => ({ ...current, [id]: { status: 'checkFailed', checkedAt: null } }));
        }
        setProgress({ done: index + 1, total: ids.length });
      }
      notify(t('accountsOnly.health.allComplete', { count: ids.length }));
    } finally {
      checking.current = false; setCheckingId(null); setProgress(null);
      needsLogin.forEach(id=>recover.current?.(id));
    }
  }, [accounts, notify, t]);
  return { health, checkingId, check, checkAll, repair, progress };
}
