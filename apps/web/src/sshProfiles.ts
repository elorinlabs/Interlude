import { authorizedFetch, getActiveSession } from './api';
import type { AuthSession } from './types';
import { createServerSshProfiles, sshProfileHttpExchange } from '../../../shared/terminal/serverSshProfiles';
import { sshProfileResponse } from '../../../shared/terminal/sshProfileResponse';

export function createWebSshProfiles(session: AuthSession) {
  const checkIdentity = (active = getActiveSession()) => {
    if (!active || active.baseUrl !== session.baseUrl || active.email !== session.email) {
      throw new Error('client.ssh.signIn');
    }
  };
  return createServerSshProfiles(sshProfileHttpExchange(async (path, init) => {
    checkIdentity();
    const response = await authorizedFetch(path, init, checkIdentity);
    checkIdentity();
    return sshProfileResponse(response);
  }));
}
