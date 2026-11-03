import { useEffect, useRef, useState } from 'react';
import type { SshProfile } from './sshProfiles';
import { useSshConnection, type SshValues } from './useSshConnection';

type Options = Omit<Parameters<typeof useSshConnection>[0], 'initial' | 'createId'> & { profile: SshProfile };

/** Launch saved settings once; request credentials only when authentication needs them. */
export function useSavedSshConnection({ profile, ...options }: Options) {
  const [values, setValues] = useState<SshValues>(profile);
  const [needsCredentials, setNeedsCredentials] = useState(false);
  const attempted = useRef(false);
  const submittedCredentials = useRef(false);
  const connection = useSshConnection({ ...options, initial: profile, createId: () => profile.id });
  useEffect(() => {
    if (attempted.current || connection.loading || connection.error) return;
    attempted.current = true;
    void connection.submit(profile);
  }, [connection, profile]);
  useEffect(() => {
    if (connection.error === 'client.ssh.authenticationFailed'
      || connection.error === 'client.ssh.credentialsRequired') setNeedsCredentials(true);
  }, [connection.error]);
  useEffect(() => {
    if (connection.finished) setValues(profile);
  }, [connection.finished, profile]);
  const setCredential = (field: 'password' | 'privateKey' | 'passphrase', value: string) =>
    setValues(previous => ({ ...previous, [field]: value }));
  const connect = () => {
    if (needsCredentials) submittedCredentials.current = true;
    return connection.submit(values);
  };
  // An automatic attempt without credentials is a login prompt, not a failed user login.
  const loginPrompt = connection.error === 'client.ssh.authenticationFailed'
    || connection.error === 'client.ssh.credentialsRequired';
  const error = loginPrompt && !submittedCredentials.current
    ? '' : connection.error;
  return { ...connection, error, values, setCredential, needsCredentials, connect };
}
