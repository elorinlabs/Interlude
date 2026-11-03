import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { MappingSync, type MappingExchange } from './sync';
import type { MappingStorage } from './settings';
import type { PortForwardingService } from './service';

export function useMappingSync(service: PortForwardingService, options: {
  scope: string; storage: MappingStorage; exchange?: MappingExchange;
}) {
  const { scope, storage, exchange } = options;
  const sync = useMemo(() => exchange ? new MappingSync(service, { scope, storage, exchange }) : undefined,
    [service, scope, storage, exchange]);
  const status = useSyncExternalStore(sync?.subscribe ?? noSubscribe, sync?.snapshot ?? noStatus);
  useEffect(() => sync?.start(), [sync]);
  return status;
}
const noSubscribe = () => () => {};
const noStatus = () => '';
