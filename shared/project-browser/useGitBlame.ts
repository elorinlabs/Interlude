import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Compartment, StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { ProjectBlame } from './protocol';
import type { BrowserTranslate } from './ProjectTree';
import { blameGutter } from './blameGutter';
import { useGutterMenu } from './useGutterMenu';

export interface BlameSource {
  read: (revision: string) => Promise<ProjectBlame>;
  revision: string; text: string; connected: boolean;
}

export function useGitBlame(view: MutableRefObject<EditorView | undefined>, source: BlameSource | undefined,
  t: BrowserTranslate) {
  const [enabled, setEnabled] = useState(false);
  const gutterMenu = useGutterMenu(view, !!source);
  const [result, setResult] = useState<ProjectBlame>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef(source); latest.current = source;
  const compartment = useRef(new Compartment());
  const supported = !!source;
  const revision = source?.revision;
  const connected = source?.connected;
  const uncommitted = t('client.gitBlame.uncommitted');
  useEffect(() => {
    setResult(undefined); setFailed(false);
    const current = latest.current;
    if (!enabled || !current || !connected) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    void current.read(current.revision).then(data => {
      if (!cancelled) setResult(data.revision === current.revision ? data : { ...data, status: 'changed' });
    }).catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, supported, revision, connected]);
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const ready = result && ['ready', 'untracked'].includes(result.status) && result.revision === revision;
    const extension = enabled && connected && ready
      ? blameGutter(result, source?.text ?? '', uncommitted) : [];
    const slot = compartment.current;
    editor.dispatch({ effects: slot.get(editor.state) === undefined
      ? StateEffect.appendConfig.of(slot.of(extension)) : slot.reconfigure(extension) });
  }, [enabled, connected, result, revision, source?.text, uncommitted, view]);
  let notice = '';
  if (enabled && connected) {
    if (loading) notice = t('client.gitBlame.loading');
    else if (failed || result?.status === 'unavailable') notice = t('client.gitBlame.unavailable');
    else if (result?.status === 'notRepository') notice = t('client.gitBlame.notRepository');
    else if (result?.status === 'changed') notice = t('client.gitBlame.changed');
  }
  return { ...gutterMenu, enabled, notice, toggle: () => { setEnabled(value => !value); gutterMenu.close(); } };
}
