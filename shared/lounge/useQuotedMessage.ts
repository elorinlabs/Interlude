import { useEffect, useState, useSyncExternalStore } from 'react';
import type { LoungeController } from './controller';
import type { LoungeReply } from './reply';
import type { LoungeMessage } from './types';

/** Quote snapshots work offline; locally stored originals also supply their time and image preview. */
export function useQuotedMessage(controller: LoungeController, reference: LoungeReply) {
  const { conversation, historyRevision } = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const [result, setResult] = useState<{ owner: LoungeController; conversation: string; key: string;
    message?: LoungeMessage }>();
  const key = JSON.stringify([reference.senderId, reference.id]);
  const current = result?.owner === controller && result.conversation === conversation && result.key === key
    ? result.message : undefined;
  const revision = current ? undefined : historyRevision;
  useEffect(() => {
    let active = true;
    void controller.lookupMessage(reference, conversation).then(message => {
      if (active) setResult({ owner: controller, conversation, key, message });
    }).catch(() => { /* The bounded quote snapshot remains readable if local storage is unavailable. */ });
    return () => { active = false; };
  }, [controller, key, conversation, revision]);
  return current;
}
