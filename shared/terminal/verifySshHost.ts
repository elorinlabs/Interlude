import type { SshApi } from './ssh';
import { sshEndpointKey, type SshProfile, type SshProfileStore } from './sshProfiles';
import { changedSshHostTrust, sameSshHostTrust, type SshHostTrust } from './sshHostTrust';
import type { SshValues } from './sshConnectionValues';

interface Options {
  api: SshApi; values: SshValues; selected?: SshProfile;
  approved?: SshHostTrust; trusted?: Pick<SshHostTrust, 'endpoint' | 'fingerprint'>;
  save: SshProfileStore['save']; active: () => boolean;
  select: (profile: SshProfile | undefined) => void; prompt: (trust: SshHostTrust | undefined) => void;
}

/** Probe again on confirmation and persist only the exact host key the user reviewed. */
export async function verifySshHost(options: Options) {
  const { api, values, selected, approved, trusted, prompt } = options;
  const endpoint = { host: values.host.trim(), port: values.port };
  const key = sshEndpointKey({ ...endpoint, username: values.username });
  const fingerprint = await api.probe(endpoint);
  const profiles = await api.profiles.list();
  if (!options.active()) return;
  validateSelection(selected, profiles);
  const known = profiles.filter(value => sshEndpointKey(value) === key && value.fingerprint);
  let currentSelection = selected;
  if (known.some(value => value.fingerprint !== fingerprint)) {
    const changed = changedSshHostTrust(known, fingerprint);
    if (!sameSshHostTrust(approved, changed)) { prompt(changed); return; }
    for (const profile of known.filter(value => value.fingerprint !== fingerprint)) {
      if (!options.active()) return;
      const updated = await options.save({ ...profile, fingerprint });
      currentSelection = updated.find(value => value.id === selected?.id);
      if (options.active()) options.select(currentSelection);
    }
    if (options.active()) prompt(undefined);
  }
  if (!known.length && (trusted?.endpoint !== key || trusted.fingerprint !== fingerprint)) {
    prompt({ endpoint: key, fingerprint }); return;
  }
  return { fingerprint, selected: currentSelection };
}

function validateSelection(selected: SshProfile | undefined, profiles: SshProfile[]) {
  if (selected?.revision === undefined) return;
  const current = profiles.find(value => value.id === selected.id);
  if (!current || current.revision !== selected.revision || current.accountScope !== selected.accountScope) {
    throw new Error('client.ssh.profileChanged');
  }
}
