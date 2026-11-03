import { useEffect, useState } from 'react';
import { generateTotp } from '../totp';
import type { TotpEntry } from '../types';

export function useTotpCodes(entries: TotpEntry[]) {
  const [state, setState] = useState({ codes: {} as Record<string, string>, now: Date.now() });
  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const tick = async () => {
      if (pending) return;
      pending = true;
      const now = Date.now();
      // One malformed imported key must not stop all other codes from updating.
      const values = await Promise.all(entries.map(async entry => {
        const code = await generateTotp(entry, now).catch(() => '');
        return [entry.id, code] as const;
      }));
      if (!cancelled) setState({ codes: Object.fromEntries(values), now });
      pending = false;
    };
    void tick();
    const timer = entries.length ? window.setInterval(() => void tick(), 1000) : undefined;
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [entries]);
  return state;
}
