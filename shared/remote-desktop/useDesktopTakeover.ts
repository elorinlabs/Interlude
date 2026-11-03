import { useEffect, useMemo, useRef, useState } from 'react';
import type { DesktopClient } from './protocol';
import { occupiedDesktopGroup } from './takeover';

export function useDesktopTakeover(client: DesktopClient, active: boolean) {
  const [pending, setPending] = useState<string>();
  const requested = useRef<string>();
  const approved = useRef<string>();
  useEffect(() => {
    requested.current = undefined; approved.current = undefined; setPending(undefined);
  }, [client, active]);
  const guardedClient = useMemo<DesktopClient>(() => ({ ...client,
    open: (id, settings) => {
      const takeover = approved.current;
      approved.current = undefined;
      return client.open(id, settings, takeover);
    },
  }), [client]);
  return { client: guardedClient, pending: !!pending,
    failed: (message: string) => {
      const group = occupiedDesktopGroup(message);
      if (!group) return false;
      requested.current = group; setPending(group); return true;
    },
    confirm: () => {
      if (!requested.current) return false;
      approved.current = requested.current; requested.current = undefined; setPending(undefined); return true;
    },
    cancel: () => { requested.current = undefined; approved.current = undefined; setPending(undefined); },
  };
}
