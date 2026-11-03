import { useEffect } from 'react';
import { setChatConnectionMode } from './policy';
import type { ConnectionMode } from './protocol';

/** Retained connections stay alive, but only the visible chat owns composer transfer limits. */
export function useActiveChatPolicy(active: boolean, mode: ConnectionMode) {
  useEffect(() => {
    if (!active) return;
    setChatConnectionMode(mode);
    return () => setChatConnectionMode('offline');
  }, [active, mode]);
}
