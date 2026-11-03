import { useState } from 'react';
import type { LoungeAccount, LoungeSnapshot } from './types';
import type { LoungeController } from './controller';
import { MAX_NICKNAME, MAX_REMARK, validName } from './names';

export interface LoungeNameEditorOptions {
  user: LoungeAccount; state: LoungeSnapshot; controller: LoungeController;
}

export function useLoungeNameEditor({ user, state, controller }: LoungeNameEditorOptions) {
  const own = user.id === state.user?.id;
  const kind = own ? 'nickname' : 'remark';
  const stored = user[kind] ?? '';
  const limit = own ? MAX_NICKNAME : MAX_REMARK;
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'' | 'client.lounge.nicknameSaveFailed' | 'client.lounge.remarkSaveFailed'>('');
  const [saved, setSaved] = useState(false);
  const value = draft ?? stored;
  const available = state.status === 'connected' && state.namesAvailable === true;
  const invalid = !validName(value, limit);
  const canSave = available && !busy && !invalid && value.trim() !== stored;
  const change = (next: string) => { setDraft(next); setError(''); setSaved(false); };
  const save = async () => {
    if (!canSave) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      await controller.setName({ kind, userId: user.id, value });
      setDraft(undefined); setSaved(true);
    } catch {
      setError(own ? 'client.lounge.nicknameSaveFailed' : 'client.lounge.remarkSaveFailed');
    } finally { setBusy(false); }
  };
  return { own, kind, value, limit, change, save, canSave, available, busy, invalid, error, saved };
}
