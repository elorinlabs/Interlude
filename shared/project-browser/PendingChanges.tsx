import { remoteErrorText } from '../localization/errors';
import { useEffect, useRef } from 'react';
import type { BrowserTranslate } from './ProjectTree';

export function PendingChanges({ saving, connected, error, path, cancel, discard, save, t }: {
  saving: boolean; connected: boolean; error: string; cancel: () => void; discard: () => void;
  save: () => void; t: BrowserTranslate; path: string;
}) {
  const host = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    host.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  return <div className="pf-confirm-backdrop">
    <section ref={host} role="alertdialog" aria-modal="true" aria-label={t("client.projectBrowser.keepYourChanges")} className="pf-confirm"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); if (!saving) cancel(); return; }
        if (event.key !== 'Tab') return;
        const buttons = Array.from(host.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }}>
      <strong>{t("client.projectBrowser.keepYourChanges")}</strong><p>{path.split(/[\\/]/).at(-1)}<br />{t("client.projectBrowser.thisFileHasUnsavedChanges")}</p>
      <div>
        <button type="button" disabled={saving} onClick={cancel}>{t("client.accounts.cancel")}</button>
        <button type="button" disabled={saving} onClick={discard}>{t("client.projectBrowser.discardChanges")}</button>
        <button type="button" className="pf-save" disabled={!connected || saving} onClick={save}>
          {t(saving ? "client.projectBrowser.saving" : "client.composer.saveAndContinue")}</button>
      </div>
      {error && <p role="alert">{remoteErrorText(error)}</p>}
    </section>
  </div>;
}
