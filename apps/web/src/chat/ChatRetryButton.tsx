import { RotateCcw } from 'lucide-react';
import { useTurnRetry } from '../../../../shared/chat/TurnRetryContext';
import { t } from '../i18n';
import './turnRetry.css';

export function ChatRetryButton({ turnId }: { turnId: string }) {
  const action = useTurnRetry(turnId);
  if (!action) return null;
  return <button type="button" className="chat-turn-retry" disabled={action.disabled}
    onClick={() => { void action.retry(); }}>
    <RotateCcw size={14} aria-hidden="true" />{action.pending ? t("client.chat.retrying") : t("client.terminal.retry")}
  </button>;
}
