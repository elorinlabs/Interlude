import { sshEndpointKey, type SshProfile } from './sshProfiles';

export interface SshHostTrust {
  endpoint: string;
  fingerprint: string;
  previousFingerprints?: string[];
  version?: string;
}

/** Confirmation covers the exact observed key and the saved pins shown in that prompt. */
export function changedSshHostTrust(profiles: SshProfile[], fingerprint: string): SshHostTrust {
  return { endpoint: sshEndpointKey(profiles[0]), fingerprint,
    previousFingerprints: [...new Set(profiles.flatMap(profile => profile.fingerprint ?? []))],
    version: JSON.stringify(profiles.map(profile =>
      [profile.id, profile.revision, profile.accountScope, profile.fingerprint]).sort()),
  };
}

export function sameSshHostTrust(left: SshHostTrust | undefined, right: SshHostTrust) {
  return left?.endpoint === right.endpoint && left.fingerprint === right.fingerprint && left.version === right.version;
}
