import { useEffect, useId, useRef } from 'react';
import { t } from '../../i18n';
import './takeover.css';

export function DesktopTakeover({ confirm, cancel, disabled }: {
  confirm: () => void; cancel: () => void; disabled: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const description = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="rd-takeover" aria-labelledby={title} aria-describedby={description}
    onCancel={event => { event.preventDefault(); cancel(); }}>
    <h2 id={title}>{t('client.remoteDesktop.takeoverTitle')}</h2>
    <p id={description}>{t('client.remoteDesktop.takeoverMessage')}</p>
    <div className="rd-takeover-actions">
      <button autoFocus onClick={cancel}>{t('client.remoteDesktop.takeoverCancel')}</button>
      <button className="rd-takeover-confirm" disabled={disabled} onClick={confirm}>
        {t('client.remoteDesktop.takeoverConfirm')}</button>
    </div>
  </dialog>;
}
