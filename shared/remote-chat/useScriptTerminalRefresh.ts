import { useEffect, useRef } from 'react';

const SCRIPT_REFRESH_MS = 2000;

/** Hidden mobile terminals still need to report script completion and closes from another client. */
export function useScriptTerminalRefresh(options: {
  scope: object; enabled: boolean; refresh: (current: () => boolean) => Promise<void>;
}) {
  const latest = useRef(options.refresh);
  latest.current = options.refresh;
  useEffect(() => {
    if (!options.enabled) return;
    let pending = false;
    let active = true;
    const timer = setInterval(() => {
      if (pending) return;
      pending = true;
      // A temporary disconnect leaves the current status intact until the next successful refresh.
      void latest.current(() => active).catch(() => undefined).finally(() => { pending = false; });
    }, SCRIPT_REFRESH_MS);
    return () => { active = false; clearInterval(timer); };
  }, [options.scope, options.enabled]);
}
