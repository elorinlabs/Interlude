import { useEffect, useRef, useState } from 'react';
import { AUTO_UNLOCK_ERRORS, DEFAULT_DESKTOP_SECURITY, type DesktopSecurity, type DesktopSecurityChange } from './security';
import type { DesktopDisplaySession } from './displaySession';

export function useDesktopSecurity(receiver: { current?: DesktopDisplaySession }, active: boolean) {
  const [value, setValue] = useState(DEFAULT_DESKTOP_SECURITY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const polling = useRef<Promise<void>>();
  const [legacyClipboardSync, setLegacyClipboardSync] = useState(true);
  useEffect(() => { if (!active) setError(''); }, [active]);
  const update = async (change: DesktopSecurityChange) => {
    const current = receiver.current;
    if (!current || pending.current) return false;
    pending.current = true; setSaving(true); setError(''); setSaved(false);
    try {
      await polling.current;
      if (receiver.current !== current) return false;
      const state = await current.security(change);
      if (receiver.current !== current) return false;
      setValue(state);
      if (!acknowledged(change, state)) throw new Error('安全选项未能保存，请重试。');
      setSaved(state.clipboardSync !== undefined || change.autoUnlock !== undefined);
      return true;
    } catch (cause) {
      const message = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '';
      if (receiver.current === current) setError(AUTO_UNLOCK_ERRORS.find(item => item === message)
        ?? '安全选项未能保存，请重试。');
      return false;
    } finally { pending.current = false; setSaving(false); }
  };
  useEffect(() => {
    if (!active || value.autoUnlock?.status !== 'unlocking') return;
    let disposed = false;
    const timer = setInterval(() => {
      const current = receiver.current;
      if (!current || pending.current || polling.current) return;
      polling.current = current.security({}).then(state => {
        if (!disposed && receiver.current === current) setValue(state);
      }).catch(() => {
        if (!disposed && receiver.current === current) setError('自动解锁状态未能更新，请重新连接后查看。');
      }).finally(() => { polling.current = undefined; });
    }, 1500);
    return () => { disposed = true; clearInterval(timer); };
  }, [active, value.autoUnlock?.status, receiver]);
  const receive = (state?: DesktopSecurity) => {
    setValue(state ?? DEFAULT_DESKTOP_SECURITY);
    if (!state) { setSaved(false); setError(''); setLegacyClipboardSync(true); }
  };
  const clipboardSync = value.clipboardSync ?? legacyClipboardSync;
  return { value, saving, saved, error, update, receive, clipboardSync,
    toggleClipboardSync: () => {
      if (value.clipboardSync === undefined) setLegacyClipboardSync(current => !current);
      else void update({ clipboardSync: !clipboardSync });
    } };
}

function acknowledged(change: DesktopSecurityChange, state: DesktopSecurity) {
  return (change.autoUnlock === undefined || state.autoUnlock?.enabled === change.autoUnlock.enabled)
    && (change.lockOnDisconnect === undefined || state.lockOnDisconnect === change.lockOnDisconnect)
    && (change.muteHost === undefined || state.muteHost === change.muteHost)
    && (change.clipboardSync === undefined || state.clipboardSync === change.clipboardSync);
}
