import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComputerListRefresh } from '../../../../shared/remote-chat/ComputerSearchBar';
import { apiJson } from '../api';
import { useAppDispatch } from '../hooks';
import { t } from '../i18n';
import { deviceSocketMessage } from '../store';
import type { RemoteDevice } from '../types';

export function useComputerListRefresh(): ComputerListRefresh {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError('');
    try {
      const { devices } = await apiJson<{ devices: RemoteDevice[] }>('/devices');
      if (mounted.current) dispatch(deviceSocketMessage({ type: 'devices-snapshot', devices }));
    } catch {
      if (mounted.current) setError(t("client.workspaceActions.couldNotLoadTheComputerListPleaseTryAgain"));
    } finally {
      pending.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [dispatch]);
  return { loading, error, refresh };
}
