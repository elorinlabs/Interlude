import { useEffect, useState } from 'react';
import { useChatUsage } from '../../../../shared/remote-chat/client/useChatUsage';
import type { ReadUsage } from '../../../../shared/remote-chat/usage';

export function useVisibleChatUsage(read: ReadUsage, active: boolean) {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return { ...useChatUsage(read, active && visible), visible };
}
