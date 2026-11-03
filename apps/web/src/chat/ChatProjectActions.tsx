import { Pin, PinOff, X } from 'lucide-react';
import type { ProjectActionsModel } from '../../../../shared/remote-chat/client/useProjectActions';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { displayError, t } from '../i18n';
import './thread-actions.css';

export function ChatProjectActions({ actions }: { actions: ProjectActionsModel }) {
  if (!actions.target) return null;
  const { target, pinned, confirmRemove, busy, error, reason } = actions;
  const disabled = busy || !!reason;
  return <AdaptiveSheet open truncateTitle width={400} onClose={actions.close}
    title={confirmRemove ? t('client.projectActions.removeTitle')
      : t('client.conversation.manageProject', { value1: target.label })}
    onBack={confirmRemove && !busy ? () => actions.confirm(false) : undefined}>
    <div className="chat-thread-actions" aria-busy={busy}>
      {confirmRemove ? <>
        <p>{t('client.projectActions.removeDescription')}</p>
        <div className="chat-thread-action-buttons">
          <button type="button" disabled={busy} onClick={actions.close}>{t('client.accounts.cancel')}</button>
          <button type="button" disabled={disabled} onClick={() => void actions.submit('remove')}>
            {t(busy ? 'client.conversation.removing' : 'client.conversation.removeProject')}</button>
        </div>
      </> : <>
        <button type="button" disabled={disabled} onClick={() => void actions.submit(pinned ? 'unpin' : 'pin')}>
          {pinned ? <PinOff size={19} /> : <Pin size={19} />}
          {t(pinned ? 'client.conversation.unpin' : 'client.conversation.pin')}</button>
        <button type="button" disabled={disabled} onClick={() => actions.confirm(true)}>
          <X size={19} />{t('client.conversation.removeProject')}</button>
      </>}
      {!!(error || reason) && <p role="alert" className={error ? 'chat-error' : 'chat-muted'}>
        {displayError(error || reason)}</p>}
    </div>
  </AdaptiveSheet>;
}
