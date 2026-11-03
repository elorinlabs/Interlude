import type { SshRemote, SshX11 } from './ssh';
import type { SshCredentials } from './sshCredentials';
import { validSshX11 } from './sshX11';

export interface SshProfile extends SshRemote {
  id: string; name: string; auth: 'password' | 'key'; fingerprint?: string; revision?: number;
  x11?: SshX11;
  /** Client-only origin; excluded by parseSshProfile before serialization. */
  accountScope?: string;
}
export interface SshProfileStore {
  list: () => Promise<SshProfile[]>;
  save: (value: SshProfile, credentials?: SshCredentials) => Promise<SshProfile[]>;
  credentials?: (profile: SshProfile) => Promise<SshCredentials | undefined>;
  remove: (id: string, revision?: number, accountScope?: string) => Promise<SshProfile[]>;
  warning?: () => string;
}
const STORAGE_KEY = 'remoteai.ssh.profiles.v1';
const MAX_PROFILES = 64;

export function parseSshProfile(value: unknown): SshProfile | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.host !== 'string'
    || typeof item.username !== 'string' || typeof item.port !== 'number'
    || !Number.isInteger(item.port) || item.port < 1 || item.port > 65535
    || !['password', 'key'].includes(String(item.auth))
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(item.id) || item.name.length > 80
    || !item.host.trim() || item.host.length > 253 || /[\s\x00-\x1f\x7f]/.test(item.host)
    || !item.username.trim() || item.username.length > 256 || /[\x00-\x1f\x7f]/.test(item.username)
    || (item.fingerprint !== undefined && (typeof item.fingerprint !== 'string'
      || item.fingerprint.length > 256))
    || (item.revision !== undefined && (!Number.isSafeInteger(item.revision) || Number(item.revision) < 0))
    || (item.x11 !== undefined && !validSshX11(item.x11))) return null;
  return { id: item.id, name: item.name, host: item.host, username: item.username,
    port: item.port, auth: item.auth as SshProfile['auth'],
    fingerprint: typeof item.fingerprint === 'string' ? item.fingerprint : undefined,
    ...(item.x11 ? { x11: { ...(item.x11.display ? { display: item.x11.display } : {}) } } : {}),
    ...(typeof item.revision === 'number' ? { revision: item.revision } : {}) };
}

export function readSshProfiles(): SshProfile[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(0, MAX_PROFILES).flatMap(value => parseSshProfile(value) ?? []) : [];
  } catch { return []; }
}

/** Explicit serialization keeps passwords, key material and passphrases out of persistent storage. */
export function saveSshProfiles(profiles: SshProfile[]) {
  const values = profiles.slice(0, MAX_PROFILES).flatMap(value => parseSshProfile(value) ?? []);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
}

/** Remove only the imported snapshot; keep a concurrent edit from an older window for the next import. */
export function legacySshProfiles() {
  const snapshot = localStorage.getItem(STORAGE_KEY);
  return { profiles: readSshProfiles(), complete() {
    if (localStorage.getItem(STORAGE_KEY) === snapshot) localStorage.removeItem(STORAGE_KEY);
  } };
}

export const sshLabel = (value: SshRemote) => `${value.username}@${value.host}:${value.port}`;
export const sshEndpointKey = (value: SshRemote) => JSON.stringify([value.host, value.port]);
