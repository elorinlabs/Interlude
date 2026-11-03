import { useSyncExternalStore } from 'react';
import { isMessageQueueEnabled, subscribeMessageQueueSettings } from './messageQueueSettings';

export function useMessageQueueEnabled(): boolean {
  return useSyncExternalStore(subscribeMessageQueueSettings, isMessageQueueEnabled, () => true);
}
