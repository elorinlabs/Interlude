import { t, useLanguage } from '../i18n';
import { useEffect, useState } from 'react';
import type { Turn } from './types';
import { SECOND_MS, turnElapsedMs } from '../../../desktop/src/pages/codexGui/turnTiming';
import { formatTurnDuration } from './formatters';
import type { TurnEntry } from '../../../../shared/chat/turnPresentation';

/** Keep the turn status before its response, including interrupted turns without timing data. */
export function desktopTimeline(entries: TurnEntry[]): TurnEntry[] {
  const seen = new Set<string>();
  return entries.flatMap(entry => {
    if (seen.has(entry.turn.id) || (entry.kind === 'message' && entry.item.type === 'userMessage')) return [entry];
    seen.add(entry.turn.id);
    if (entry.kind === 'work') return [{ ...entry, timed: true }];
    if (entry.kind === 'duration' || entry.turn.status !== 'interrupted') return [entry];
    return [{ id: `${entry.turn.id}:duration`, kind: 'duration', turn: entry.turn }, entry];
  });
}

export function ChatTurnTiming({ turn, fallback = '' }: { turn: Turn; fallback?: string }) {
  useLanguage();
  const [now, setNow] = useState(Date.now);
  const running = turn.status === 'inProgress';
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), SECOND_MS);
    return () => window.clearInterval(timer);
  }, [turn.id, running]);
  const elapsed = turnElapsedMs(turn, now);
  if (turn.status === 'interrupted') return <>{t("client.chat.generationStopped")}{elapsed != null && t("client.chat.duration.fdf64e", { value1: formatTurnDuration(elapsed) })}</>;
  if (elapsed == null) return <>{fallback}</>;
  return <>{running ? t("client.chat.workingFor") : t("client.chat.duration.8d6d31")} {formatTurnDuration(elapsed)}</>;
}
