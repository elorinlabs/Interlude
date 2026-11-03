import { useEffect, useSyncExternalStore } from 'react';
import { LoungeController } from './controller';

export function useLounge(controller: LoungeController) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useEffect(() => { controller.start(); return () => controller.stop(); }, [controller]);
  return state;
}
