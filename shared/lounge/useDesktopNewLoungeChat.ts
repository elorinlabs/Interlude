import { useState } from 'react';
import { accountMatches } from './names';
import type { LoungeAccount } from './types';
import { useNewLoungeChat, type NewLoungeChatOptions } from './useNewLoungeChat';

const HISTORY_KEY = 'codex-switch:lounge:recent-speakers-cleared:';
// Keep dismissal usable when browser storage is unavailable, without deleting messages or contacts.
const clearedInMemory = new Map<string, number>();

function readClearedAt(key: string) {
  try {
    const value = Number(localStorage.getItem(key));
    if (Number.isFinite(value) && value >= 0) return Math.max(value, clearedInMemory.get(key) ?? 0);
  } catch { /* Private browsing can deny storage; use the current session's dismissal. */ }
  return clearedInMemory.get(key) ?? 0;
}

export function useDesktopNewLoungeChat(options: NewLoungeChatOptions) {
  const model = useNewLoungeChat(options);
  const key = HISTORY_KEY + options.controller.historyScope;
  const [clearedAt, setClearedAt] = useState(() => readClearedAt(key));
  const [selected, setSelected] = useState<LoungeAccount>();
  const recent = options.controller.recentSpeakers(clearedAt);
  const speakers = recent.filter(user => accountMatches(user, model.query));
  const setQuery = (value: string) => { setSelected(undefined); model.setQuery(value); };
  const choose = (user: LoungeAccount) => { model.setQuery(model.query); setSelected(user); };
  const clear = () => {
    const now = Date.now();
    clearedInMemory.set(key, now); setClearedAt(now); setSelected(undefined);
    try { localStorage.setItem(key, String(now)); }
    catch { /* Session dismissal remains available when storage is full or disabled. */ }
  };
  const submit = async () => {
    if (model.busy) return;
    if (selected && options.state.directAvailable) model.open(selected);
    else await model.submit();
  };
  const canSubmit = selected ? options.state.directAvailable : !!model.query.trim() && model.available;
  return { ...model, speakers, selected, setQuery, choose, clear, submit, canSubmit, hasRecent: recent.length > 0 };
}

export type DesktopNewLoungeChat = ReturnType<typeof useDesktopNewLoungeChat>;
