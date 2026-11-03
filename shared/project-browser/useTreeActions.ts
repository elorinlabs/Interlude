import { useEffect, useRef, useState } from 'react';
import type { ProjectFile } from '../remote-chat/projectFiles';
import type { BrowserHost, EntryRequest } from './entryActions';
import { withinPath } from './entryActions';
import type { ProjectDocuments } from './documents';

export type TreeCommand = 'createFile' | 'createFolder' | 'cut' | 'copy' | 'copyPath' | 'paste'
  | 'rename' | 'delete' | 'explorer' | 'terminal' | 'download' | 'reference';
export interface TreeMenu { entry: ProjectFile; x: number; y: number }
export interface TreePrompt { entry: ProjectFile; action: 'createFile' | 'createFolder' | 'rename' | 'delete' }
interface Clipboard { entry: ProjectFile; cut: boolean }

export function useTreeActions(options: {
  cwd: string; connected: boolean; host: BrowserHost; documents: ProjectDocuments;
  choose: (path: string) => void;
}) {
  const [menu, setMenu] = useState<TreeMenu>();
  const [prompt, setPrompt] = useState<TreePrompt>();
  const [clipboard, setClipboard] = useState<Clipboard>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const flight = useRef(false);
  useEffect(() => { if (!options.connected) setMenu(undefined); }, [options.connected]);
  const run = async (action: () => Promise<void>) => {
    if (flight.current || !options.connected) return;
    flight.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (cause) { setError(typeof cause === 'string' ? cause
      : cause instanceof Error ? cause.message : '操作未完成，请重试。'); }
    finally { flight.current = false; setBusy(false); }
  };
  const change = async (request: EntryRequest) => {
    const result = await options.documents.mutate(request);
    setPrompt(undefined);
    if (request.action === 'createFile') options.choose(result.path);
  };
  const paste = (entry: ProjectFile) => run(async () => {
    if (!clipboard || !entry.directory) return;
    const request: EntryRequest = { cwd: options.cwd, path: clipboard.entry.path,
      action: clipboard.cut ? 'move' : 'copy', directory: entry.path };
    await change(request);
    if (clipboard.cut) setClipboard(undefined);
    setMessage('粘贴完成。');
  });
  const command = (entry: ProjectFile, action: TreeCommand) => {
    if (flight.current || !options.connected) return;
    setMenu(undefined); setError(''); setMessage('');
    if (['createFile', 'createFolder', 'rename', 'delete'].includes(action)) {
      setPrompt({ entry, action: action as TreePrompt['action'] }); return;
    }
    if (action === 'copy' || action === 'cut') {
      if (options.host.entryActions && !options.host.entryActions.includes(action === 'cut' ? 'move' : 'copy')) return;
      setClipboard({ entry, cut: action === 'cut' });
      setMessage(action === 'cut' ? '已剪切，请到目标文件夹粘贴。' : '已复制，请到目标文件夹粘贴。'); return;
    }
    if (action === 'paste') { void paste(entry); return; }
    void run(async () => {
      if (action === 'reference') await options.host.reference?.(entry);
      if (action === 'copyPath') { await options.host.copyPath(entry.path); setMessage('路径已复制。'); }
      if (action === 'explorer') await options.host.open?.(entry);
      if (action === 'terminal') options.host.openTerminal?.(entry);
      if (action === 'download') {
        const text = await options.host.download?.({ cwd: options.cwd, path: entry.path });
        if (text) setMessage(text);
      }
    });
  };
  const confirm = (name: string) => run(async () => {
    if (!prompt) return;
    const action = prompt.action === 'delete' ? { action: 'delete' as const } : { action: prompt.action, name };
    await change({ cwd: options.cwd, path: prompt.entry.path, ...action });
    if (clipboard && withinPath(clipboard.entry.path, prompt.entry.path)
      && (prompt.action === 'delete' || prompt.action === 'rename')) setClipboard(undefined);
  });
  return { menu, prompt, clipboard, busy, message, error, command, confirm,
    show: (value: TreeMenu) => { if (!busy && options.connected) { setMenu(value); setError(''); } },
    close: () => setMenu(undefined),
    cancel: () => { if (!busy) { setPrompt(undefined); setError(''); } },
  };
}
