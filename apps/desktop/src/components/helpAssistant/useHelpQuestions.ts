import { useEffect, useState } from 'react';
import { hasLocalBackend, invoke } from '../../api/backend';
import type { Language } from '../../i18n';

interface HelpQuestion { zh: string; en: string }

export function useHelpQuestions(open: boolean, language: Language, fallback: string[]) {
  const [questions, setQuestions] = useState<HelpQuestion[] | null>();
  useEffect(() => {
    if (!open || !hasLocalBackend) return;
    let active = true;
    void invoke<HelpQuestion[] | null>('remote_ai_help_questions')
      .then((items) => { if (active) setQuestions(Array.isArray(items) ? items : null); })
      .catch(() => { if (active) setQuestions((previous) => previous ?? null); });
    return () => { active = false; };
  }, [open]);
  if (!hasLocalBackend || questions === null) return fallback;
  return questions?.map((question) => language === 'zh' ? question.zh || question.en : question.en || question.zh)
    .filter((question) => question.trim()) ?? [];
}
