import { useCallback, useEffect, useRef, useState } from 'react';
import type { PetDockApi, PetDockStatus } from './types';

const STATUS_INTERVAL_MS = 2_500;

export function usePetDock(api: PetDockApi) {
  const [status, setStatus] = useState<PetDockStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<'loadError' | 'saveError' | null>(null);
  const active = useRef(false);
  const reading = useRef(false);
  const writing = useRef(false);
  const revision = useRef(0);

  const refresh = useCallback(async () => {
    if (reading.current || writing.current) return;
    reading.current = true;
    const requestRevision = revision.current;
    try {
      const next = await api.load();
      if (active.current && requestRevision === revision.current) {
        setStatus(next);
        setError((current) => current === 'loadError' ? null : current);
      }
    } catch {
      if (active.current && requestRevision === revision.current) setError('loadError');
    } finally { reading.current = false; }
  }, [api]);

  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, STATUS_INTERVAL_MS);
    return () => { active.current = false; clearInterval(timer); };
  }, [refresh]);

  const save = useCallback(async (request: () => Promise<PetDockStatus>) => {
    if (writing.current) return;
    writing.current = true;
    revision.current += 1;
    setSaving(true);
    setError(null);
    try {
      const next = await request();
      if (active.current) setStatus(next);
    } catch {
      if (active.current) setError('saveError');
    } finally {
      writing.current = false;
      if (active.current) setSaving(false);
    }
  }, []);

  const update = useCallback((enabled: boolean) => save(() => api.save(enabled)), [api, save]);
  const updateLabels = useCallback((showLabels: boolean) => save(() => api.saveLabels(showLabels)), [api, save]);

  return { status, saving, error, update, updateLabels, refresh };
}
