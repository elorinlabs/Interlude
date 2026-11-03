import { utf8ToBytes } from '@noble/hashes/utils';
import type { SshProfile, SshProfileStore } from './sshProfiles';
import type { SshValues } from './sshConnectionValues';

export interface SshCredentials { password?: string; privateKey?: string; passphrase?: string }
const LIMITS = { password: 4096, privateKey: 65536, passphrase: 4096 } as const;

/** Credential responses are kept in the current request, never in the synchronized profile list. */
export function parseSshCredentials(value: unknown): SshCredentials | undefined {
  if (value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('client.ssh.syncFailed');
  const result: SshCredentials = {};
  for (const [field, secret] of Object.entries(value)) {
    if (!Object.prototype.hasOwnProperty.call(LIMITS, field) || typeof secret !== 'string' || secret.includes('\0')
      || utf8ToBytes(secret).length > LIMITS[field as keyof SshCredentials]) {
      throw new Error('client.ssh.invalid');
    }
    result[field as keyof SshCredentials] = secret;
  }
  if ((result.password !== undefined && (result.privateKey !== undefined || result.passphrase !== undefined))
    || (result.passphrase !== undefined && result.privateKey === undefined)) throw new Error('client.ssh.invalid');
  return result;
}

export const sameSshLogin = (values: SshValues, selected?: SshProfile) => !!selected
  && selected.host === values.host.trim() && selected.port === values.port
  && selected.username === values.username.trim() && selected.auth === values.auth;

export function enteredSshCredentials(values: SshValues): SshCredentials | undefined {
  if (values.auth === 'password') return values.password ? { password: values.password } : undefined;
  if (values.privateKey?.trim()) return { privateKey: values.privateKey, passphrase: values.passphrase ?? '' };
  return values.passphrase ? { passphrase: values.passphrase } : undefined;
}

export async function resolveSshLogin(options: {
  values: SshValues; selected?: SshProfile; store: SshProfileStore;
}): Promise<SshValues> {
  const { values, selected, store } = options;
  const entered = enteredSshCredentials(values);
  if (entered?.password !== undefined || entered?.privateKey) return values;
  if (sameSshLogin(values, selected) && selected?.revision && store.credentials) {
    const saved = await store.credentials(selected);
    if (saved && (values.auth === 'password' ? saved.password !== undefined : saved.privateKey?.trim())) {
      return { ...values, ...saved, ...entered };
    }
    throw new Error('client.ssh.credentialsRequired');
  }
  if (values.auth === 'key') throw new Error('client.ssh.credentialsRequired');
  return values;
}
