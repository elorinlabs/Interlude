import { useEffect, useRef, useState } from 'react';
import { sshError, type SshApi } from './ssh';
import { sshEndpointKey, type SshProfile } from './sshProfiles';
import type { TerminalInfo } from './types';
import { useSshProfiles } from './useSshProfiles';
import { enteredSshCredentials, resolveSshLogin, sameSshLogin } from './sshCredentials';
import type { SshHostTrust } from './sshHostTrust';
import { verifySshHost } from './verifySshHost';
import { newSshValues, sameSshProfile, sshConnectFromValues, sshProfileFromValues, validSshSettings, validSshValues,
  type SshValues } from './sshConnectionValues';
export { newSshValues, validSshValues, type SshValues } from './sshConnectionValues';

interface Options {
  api: SshApi; projectCwd: string; initial?: SshProfile; createId: () => string;
  connected: (info: TerminalInfo) => void; dispose: (id: string) => Promise<void>; close: () => void;
}

/** Shared host verification and save flow for desktop, browser and native forms. */
export function useSshConnection(options: Options) {
  const { api, projectCwd, initial, createId, connected, dispose, close } = options;
  const saved = useSshProfiles(api.profiles);
  const [selected, setSelected] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [preparingX11, setPreparingX11] = useState(false);
  const [error, setError] = useState('');
  const [trust, setTrust] = useState<SshHostTrust>();
  const retry = useRef<{ operation: 'connect' | 'test'; values: SshValues }>();
  const [tested, setTested] = useState<{ endpoint: string; fingerprint: string }>();
  const [action, setAction] = useState<'connect' | 'test' | 'save' | 'remove'>();
  const lifetime = useRef(true);
  const pending = useRef(false);
  useEffect(() => { lifetime.current = true; return () => { lifetime.current = false; }; }, []);
  const choose = (profile?: SshProfile) => {
    retry.current = undefined;
    setSelected(profile); setError(''); setTrust(undefined); setTested(undefined);
    return profile ?? newSshValues();
  };
  const connect = async (values: SshValues, login: SshValues, fingerprint: string, profileSelection = selected) => {
    const info = await api.open(sshConnectFromValues(login, fingerprint), projectCwd);
    if (!lifetime.current) { await dispose(info.id); return; }
    const profile = sshProfileFromValues({ values, id: profileSelection?.id ?? createId(),
      selected: profileSelection, fingerprint });
    let stored = true;
    const credentials = enteredSshCredentials(values) ? enteredSshCredentials(login) : undefined;
    try {
      if (credentials || !profileSelection || !sameSshProfile(profileSelection, profile)) await saved.save(profile, credentials);
    }
    catch (failure) { stored = false;
      if (lifetime.current) setError(sshError(failure, 'client.ssh.storageFailed')); }
    if (!lifetime.current) { await dispose(info.id); return; }
    connected(info); setFinished(true);
    if (stored) close();
  };
  const run = async (operation: 'connect' | 'test' | 'save', values: SshValues, approved?: SshHostTrust) => {
    if (pending.current || finished || saved.loading || saved.error) return;
    if (!validSshSettings(values)) {
      setError('client.ssh.invalid'); return;
    }
    pending.current = true; setBusy(true); setAction(operation); setError('');
    try {
      if (operation === 'save') { await saveSettings(values); return; }
      setTested(undefined);
      retry.current = { operation, values: { ...values } };
      const verified = await verifySshHost({ api, values, selected, approved, trusted: trust ?? tested,
        save: saved.save, active: () => lifetime.current, select: setSelected, prompt: setTrust });
      if (!verified || !lifetime.current) return;
      retry.current = undefined;
      const { fingerprint } = verified;
      const login = await resolveSshLogin({ values, selected: verified.selected, store: api.profiles });
      if (!lifetime.current) return;
      if (operation === 'test') await testConnection(login, fingerprint);
      else await connect(values, login, fingerprint, verified.selected);
    } catch (failure) {
      if (lifetime.current) setError(sshError(failure,
        operation === 'save' ? 'client.ssh.storageFailed' : 'client.ssh.connectionFailed'));
    } finally { pending.current = false; if (lifetime.current) { setBusy(false); setAction(undefined); } }
  };
  const saveSettings = async (values: SshValues) => {
    if (values.x11) {
      if (!api.ensureX11) throw new Error('client.ssh.updateRequired');
      setPreparingX11(true);
      try { await api.ensureX11(values.x11); }
      finally { if (lifetime.current) setPreparingX11(false); }
      if (!lifetime.current) return;
    }
    const endpoint = sshEndpointKey({ ...values, host: values.host.trim() });
    const profile = sshProfileFromValues({ values, id: selected?.id ?? createId(), selected,
      fingerprint: tested?.endpoint === endpoint ? tested.fingerprint : undefined });
    let credentials = enteredSshCredentials(values);
    if (credentials?.passphrase && !credentials.privateKey) {
      credentials = enteredSshCredentials(await resolveSshLogin({ values, selected, store: api.profiles }));
    }
    if (credentials || !selected || !sameSshProfile(selected, profile)) await saved.save(profile, credentials);
    if (lifetime.current) { setFinished(true); close(); }
  };
  const testConnection = async (values: SshValues, fingerprint: string) => {
    const request = sshConnectFromValues(values, fingerprint);
    const info = await api.open(request, projectCwd);
    await dispose(info.id);
    if (lifetime.current) {
      setTrust(undefined);
      setTested({ endpoint: sshEndpointKey({ ...request.endpoint, username: request.username }), fingerprint });
    }
  };
  const remove = async () => {
    if (!selected || pending.current) return false;
    pending.current = true; setBusy(true); setAction('remove'); setError('');
    try {
      await saved.remove(selected.id, selected.revision, selected.accountScope);
      if (lifetime.current) choose(); return true;
    }
    catch (failure) { if (lifetime.current) setError(sshError(failure, 'client.ssh.storageFailed')); return false; }
    finally { pending.current = false; if (lifetime.current) { setBusy(false); setAction(undefined); } }
  };
  const current = selected && saved.profiles.find(value => value.id === selected.id);
  const selectionError = !finished && selected?.revision && !saved.loading && !saved.error
    && (!current || current.revision !== selected.revision || current.accountScope !== selected.accountScope)
    ? 'client.ssh.profileChanged' : '';
  return { ...saved, selected, choose, busy, action, finished, preparingX11,
    error: error || saved.error || selectionError, trust,
    canConnect: (values: SshValues) => validSshValues(values)
      || (validSshSettings(values) && sameSshLogin(values, selected) && !!api.profiles.credentials),
    tested: !!tested, clearTest: () => setTested(undefined),
    clearTrust: () => { retry.current = undefined; setTrust(undefined); },
    confirmTrust: () => {
      const requested = retry.current;
      if (requested && trust) return run(requested.operation, requested.values, trust);
    },
    submit: (values: SshValues) => run('connect', values), saveSettings: (values: SshValues) => run('save', values),
    test: (values: SshValues) => run('test', values), remove };
}
