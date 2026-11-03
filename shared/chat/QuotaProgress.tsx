import type { CSSProperties, ReactNode } from 'react';
import type { usageTrailing } from '../remote-chat/usage';
import { remainingStroke } from '../quota';
import './quotaProgress.css';

export function QuotaProgress({ trailing, remaining, children }: {
  trailing: NonNullable<ReturnType<typeof usageTrailing>>; remaining: number; children: ReactNode;
}) {
  const { quota } = trailing;
  if (!quota) return <>{children}</>;
  const percent = Math.min(100, Math.max(0, remaining));
  const style = { '--quota-percent': `${percent}%`,
    '--quota-stroke': remainingStroke(Math.round(remaining)) } as CSSProperties;
  return <span className="cs-quota-progress" style={style} role="progressbar"
    aria-label={trailing.description} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    aria-valuetext={`${trailing.text} · ${quota.remaining} · ${quota.total}`}>
    <span className="cs-quota-progress-track" aria-hidden="true"><span /></span>
    <span className="cs-quota-progress-content">{children}</span>
  </span>;
}
