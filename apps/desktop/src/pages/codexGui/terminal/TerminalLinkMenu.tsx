import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { DetailsContext } from '../detailsContext';
import type { TerminalApi } from '../../../../../../shared/terminal/types';
import { websiteUrl } from '../../../../../../shared/terminal/links';
import styles from './terminal.module.less';

export interface TerminalLinkTarget { url: string; x: number; y: number }

export function TerminalLinkMenu({ target, id, api, close, translate: t }: {
  target: TerminalLinkTarget; id?: string; api: TerminalApi; close: () => void; translate: (source: string) => string;
}) {
  const panel = useContext(DetailsContext);
  const host = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    alive.current = true; host.current?.querySelector('button')?.focus();
    const outside = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape, true);
    return () => {
      alive.current = false;
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true);
    };
  }, [close]);
  const open = async (preview: boolean) => {
    if (busy || !websiteUrl(target.url)) return;
    setBusy(true); setError('');
    try {
      if (api.resolveLink && !id) throw new Error('终端暂时无法连接，请确认电脑在线后重试。');
      const url = api.resolveLink && id ? await api.resolveLink(id, target.url) : target.url;
      if (!alive.current) return;
      if (preview && panel) panel.openWebsite(url);
      else if (isTauri()) await openUrl(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
      if (alive.current) close();
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : '链接暂时无法打开，请稍后重试。');
    } finally { if (alive.current) setBusy(false); }
  };
  return createPortal(<div ref={host} className={styles.linkMenu} role="dialog" aria-modal="true"
    aria-label={t("client.terminal.openTerminalLink")}
    style={{ left: Math.max(8, Math.min(target.x, window.innerWidth - 296)),
      top: Math.max(8, Math.min(target.y, window.innerHeight - 170)) }}>
    <div className={styles.linkUrl}>{target.url}</div>
    <div className={styles.linkActions}>
      {panel && <button disabled={busy} onClick={() => { void open(true); }}>{t("client.terminal.previewInApp")}</button>}
      <button disabled={busy} onClick={() => { void open(false); }}>{t("client.workspaceActions.openInBrowser")}</button>
    </div>
    {busy && <div role="status">{t("client.terminal.openingLink")}</div>}
    {error && <div role="alert">{t(error)}</div>}
  </div>, document.body);
}
