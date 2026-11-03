import { useEffect, useState } from 'react';
import type { SecuritySettingsProps } from './security';

/** Credentials exist only while this form is open. They never enter preference storage or returned snapshots. */
export function useAutoUnlockForm(props: Pick<SecuritySettingsProps, 'connected' | 'control' | 'value' | 'update'>) {
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const cancel = () => { setEditing(false); setUsername(''); setPassword(''); };
  useEffect(() => { if (!props.connected || !props.control) cancel(); }, [props.connected, props.control]);
  const save = async () => {
    if (!username.trim() || !password) return;
    const change = { enabled: true as const, username: username.trim(), password };
    setPassword('');
    if (await props.update({ autoUnlock: change })) cancel();
  };
  const toggle = () => {
    if (props.value.autoUnlock?.enabled) { cancel(); void props.update({ autoUnlock: { enabled: false } }); }
    else setEditing(true);
  };
  return { editing, username, password, setUsername, setPassword, cancel, save, toggle,
    edit: () => { cancel(); setEditing(true); } };
}
