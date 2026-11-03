import { t } from '../i18n';
import { useState } from 'react';

const STORAGE_PREFIX = 'codex-switch.web.dismissed-questions:';

function readDismissed(key: string): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []);
  } catch { return new Set(); }
}

/** Scope dismissed reminders to the signed-in account, computer, conversation and question. */
export function useDismissedQuestions(scope: string) {
  const key = STORAGE_PREFIX + scope;
  const [dismissed, setDismissed] = useState(() => readDismissed(key));
  const [error, setError] = useState('');
  const dismiss = (id: string) => {
    const next = new Set([...readDismissed(key), ...dismissed, id]);
    try {
      localStorage.setItem(key, JSON.stringify([...next]));
      setDismissed(next); setError('');
    } catch { setError(t("client.chat.couldNotDeletePleaseTryAgain")); }
  };
  return { dismissed, dismiss, error };
}
