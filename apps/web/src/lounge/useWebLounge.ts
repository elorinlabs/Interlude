import { useMemo } from 'react';
import { LoungeController } from '../../../../shared/lounge/controller';
import { browserAvatarStore } from '../../../../shared/lounge/avatar';
import { browserLoungeHistory } from '../../../../shared/lounge/browserHistory';
import { useLounge } from '../../../../shared/lounge/useLounge';
import { browserLoungeSync } from '../../../../shared/lounge/browserSync';
import { apiJson, getActiveSession } from '../api';
import type { AuthSession } from '../types';

export function useWebLounge(session: AuthSession | null) {
  const baseUrl = session?.baseUrl;
  const email = session?.email;
  const controller = useMemo(() => new LoungeController(baseUrl && email ? {
    sync: browserLoungeSync,
    baseUrl, account: email, avatars: browserAvatarStore(baseUrl), history: browserLoungeHistory(baseUrl, email), authorize: async () => {
      const current = getActiveSession();
      if (current?.baseUrl !== baseUrl || current.email !== email) throw new Error('client.lounge.signIn');
      return apiJson<{ ticket: string }>('/lounge/ticket', { method: 'POST' });
    },
  } : undefined), [baseUrl, email]);
  const state = useLounge(controller);
  return { controller, state };
}
