import { useRef, useState } from 'react';
import type { LoungeController } from './controller';

export function useLoungeNotificationSettings(controller: LoungeController) {
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState(false);
  const save = async (conversation: string, muted: boolean) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true); setError(false);
    try { await controller.setNotificationsMuted(conversation, muted); }
    catch { setError(true); }
    finally { saving.current = false; setBusy(false); }
  };
  return { busy, error, save };
}
