import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GitClient, GitSettings } from './gitTypes';

const SETTINGS_REFRESH_MS = 1000;
const SETTINGS_ERROR = '暂时无法同步 Git 设置，请稍后重试。';

/** The selected computer owns this preference; viewers only cache its acknowledged revision. */
export function useGitSettings(client: GitClient, enabled: boolean) {
  const gate = useMemo<{ reading?: Promise<void>; saving: boolean }>(() => ({ saving: false }), [client]);
  const current = useRef(gate);
  current.current = gate;
  const [settings, setSettings] = useState<GitSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const accept = useCallback((next: GitSettings) => {
    if (current.current !== gate) return;
    setSettings(previous => !previous || next.revision >= previous.revision ? next : previous);
    setError('');
  }, [gate]);
  useEffect(() => {
    current.current = gate; setSettings(null); setSaving(false); setError('');
    return () => { current.current = { saving: false }; };
  }, [gate]);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (gate.reading || gate.saving || current.current !== gate) return;
      gate.reading = client.settings().then(accept).catch(() => {
        if (current.current === gate) setError(SETTINGS_ERROR);
      }).finally(() => { gate.reading = undefined; });
    };
    refresh();
    const timer = setInterval(refresh, SETTINGS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [client, enabled, gate, accept]);
  const setAutoMessage = async (autoMessage: boolean) => {
    if (!enabled || !settings || gate.saving || current.current !== gate) return;
    gate.saving = true; setSaving(true); setError('');
    try {
      await gate.reading;
      if (current.current === gate) accept(await client.settings(autoMessage));
    } catch { if (current.current === gate) setError(SETTINGS_ERROR); }
    finally { gate.saving = false; if (current.current === gate) setSaving(false); }
  };
  return { autoMessage: settings?.autoMessage ?? false, setAutoMessage,
    settingsBusy: saving || !settings, settingsError: error };
}
