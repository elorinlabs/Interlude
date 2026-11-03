import { parseSshProfile, type SshProfile, type SshProfileStore } from './sshProfiles';
import { parseSshCredentials, type SshCredentials } from './sshCredentials';

export type SshProfileRequest = { type: 'list' } | { type: 'save'; profile: SshProfile; credentials?: SshCredentials }
  | { type: 'credentials'; id: string; revision: number }
  | { type: 'remove'; id: string; revision: number } | { type: 'import'; profiles: SshProfile[] };
export type SshProfileExchange = (request: SshProfileRequest, accountScope?: string) => Promise<unknown>;
export type SshProfileJson = (path: string, init: RequestInit) => Promise<unknown>;
const PATH = '/sync/ssh-profiles';
const REQUEST_TIMEOUT_MS = 15_000;

export function sshProfileHttpExchange(json: SshProfileJson): SshProfileExchange {
  return async request => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const init: RequestInit = { signal: controller.signal, headers: { 'Content-Type': 'application/json' } };
    try {
      switch (request.type) {
        case 'list': return await json(PATH, { ...init, method: 'GET' });
        case 'import': return await json(`${PATH}/import`, { ...init, method: 'POST',
          body: JSON.stringify({ profiles: request.profiles }) });
        case 'save': return await json(`${PATH}/${encodeURIComponent(request.profile.id)}`, { ...init,
          method: 'PUT', body: JSON.stringify({ ...request.profile,
            ...(request.credentials ? { credentials: request.credentials } : {}) }) });
        case 'credentials': return await json(`${PATH}/${encodeURIComponent(request.id)}/credentials`, { ...init,
          method: 'POST', body: JSON.stringify({ revision: request.revision }) });
        case 'remove': return await json(`${PATH}/${encodeURIComponent(request.id)}`, { ...init,
          method: 'DELETE', body: JSON.stringify({ revision: request.revision }) });
      }
    } finally { clearTimeout(timer); }
  };
}

export function parseServerSshProfiles(value: unknown): SshProfile[] {
  if (!Array.isArray(value) || value.length > 64) throw new Error('client.ssh.loadFailed');
  const ids = new Set<string>();
  return value.map(entry => {
    const profile = parseSshProfile(entry);
    if (!profile || !profile.revision || ids.has(profile.id)) throw new Error('client.ssh.loadFailed');
    ids.add(profile.id);
    return profile;
  });
}

/** Each mutation targets one record with its observed revision; stale clients cannot undo newer changes. */
export function createServerSshProfiles(exchange: SshProfileExchange, scope?: () => Promise<string>): SshProfileStore {
  const send = async (request: SshProfileRequest, origin?: string) => {
    const accountScope = await scope?.();
    if (origin && origin !== accountScope) throw new Error('client.ssh.signIn');
    const result = await exchange(request, accountScope);
    if (accountScope !== await scope?.()) throw new Error('client.ssh.signIn');
    return { result, accountScope };
  };
  const profiles = async (request: SshProfileRequest, origin?: string) => {
    const { result, accountScope } = await send(request, origin);
    const values = parseServerSshProfiles(result);
    return accountScope ? values.map(profile => ({ ...profile, accountScope })) : values;
  };
  return {
    list: () => profiles({ type: 'list' }),
    async save(value, credentials) {
      const profile = parseSshProfile(value);
      if (!profile) throw new Error('client.ssh.invalid');
      const secret = credentials ? parseSshCredentials(credentials) : undefined;
      return profiles({ type: 'save', profile, ...(secret ? { credentials: secret } : {}) }, value.accountScope);
    },
    async credentials(value) {
      const profile = parseSshProfile(value);
      if (!profile?.revision) throw new Error('client.ssh.profileChanged');
      const { result } = await send({ type: 'credentials', id: profile.id, revision: profile.revision },
        value.accountScope);
      if (!result || typeof result !== 'object' || !('credentials' in result)) {
        throw new Error('client.ssh.updateRequired');
      }
      return parseSshCredentials(result.credentials);
    },
    async remove(id, revision, accountScope) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !Number.isSafeInteger(revision) || !revision) {
        throw new Error('client.ssh.profileChanged');
      }
      return profiles({ type: 'remove', id, revision }, accountScope);
    },
  };
}
