import { useEffect, useRef, useState } from 'react';
import type { DesktopInputFocus } from './protocol';
import { desktopInputFocus } from './inputFocus';

const FOCUS_INTERVAL_MS = 250;

/** Read only while typing; slow accessibility providers never produce overlapping requests. */
export function useDesktopInputFocus(options: {
  active: boolean; read: () => Promise<DesktopInputFocus | null>; displayId?: string;
}) {
  const { active, displayId } = options;
  const read = useRef(options.read); read.current = options.read;
  const pending = useRef(false);
  const [focus, setFocus] = useState<{ displayId?: string; value: DesktopInputFocus | null }>();
  useEffect(() => {
    setFocus(undefined);
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const update = async () => {
      if (!pending.current) {
        pending.current = true;
        let value: DesktopInputFocus | null = null;
        try { value = desktopInputFocus(await read.current()); }
        catch { /* Unsupported apps and disconnected hosts fall back to the virtual mouse. */ }
        finally { pending.current = false; }
        if (!stopped) setFocus({ displayId, value });
      }
      if (!stopped) timer = setTimeout(() => { void update(); }, FOCUS_INTERVAL_MS);
    };
    void update();
    return () => { stopped = true; clearTimeout(timer); };
  }, [active, displayId]);
  return active && focus?.displayId === displayId ? focus?.value ?? null : null;
}
