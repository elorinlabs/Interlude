import { useEffect, useRef, useState } from 'react';
import type { SshEntry } from './ssh';
import { browserSshUpload } from './sshTransfers';
import type { SshUpload } from './sshTransfers';
import { sshChild, validSshName, type useSshFiles, type SshUploadOptions } from './useSshFiles';
import type { SshConflictChoice } from './sshUpload';

export type SshFilesState = ReturnType<typeof useSshFiles>;
export interface SshFilePrompt {
  kind: 'createFolder' | 'createFile' | 'rename' | 'delete'; name: string; entry?: SshEntry;
}

export function useSshFileActions(files: SshFilesState) {
  const [prompt, setPrompt] = useState<SshFilePrompt>();
  const [conflict, setConflict] = useState<string>();
  const [copyStatus, setCopyStatus] = useState('');
  const resolver = useRef<(choice: SshConflictChoice) => void>();
  useEffect(() => () => { resolver.current?.(undefined); }, []);
  const resolveConflict = (name: string) => new Promise<SshConflictChoice>(resolve => {
    resolver.current = resolve; setConflict(name);
  });
  const chooseConflict = (choice: SshConflictChoice) => {
    resolver.current?.(choice); resolver.current = undefined; setConflict(undefined);
  };
  const confirm = async () => {
    if (!prompt || files.busy) return;
    if (prompt.kind !== 'delete' && !validSshName(prompt.name)) return;
    const done = await files.mutate(promptRequest(prompt, sshChild(files.path, prompt.name)));
    if (done) setPrompt(undefined);
  };
  const uploadSources = (selected: SshUpload[], options?: SshUploadOptions) =>
    files.uploadMany(selected, resolveConflict, options);
  const upload = (selected: FileList) => uploadSources(Array.from(selected).map(browserSshUpload));
  const copyPath = async (path: string) => {
    try { await navigator.clipboard.writeText(path); setCopyStatus('client.ssh.pathCopied'); }
    catch { setCopyStatus('client.ssh.copyFailed'); }
  };
  return { prompt, setPrompt, confirm, upload, uploadSources, conflict, chooseConflict, copyPath, copyStatus,
    create: (kind: 'createFolder' | 'createFile') => setPrompt({ kind, name: '' }),
    rename: (entry: SshEntry) => setPrompt({ kind: 'rename', name: entry.name, entry }),
    remove: (entry: SshEntry) => setPrompt({ kind: 'delete', name: entry.name, entry }) };
}

function promptRequest(prompt: SshFilePrompt, destination: string): Parameters<SshFilesState['mutate']>[0] {
  switch (prompt.kind) {
    case 'rename': return { type: 'rename', path: prompt.entry!.path, destination };
    case 'delete': return { type: prompt.entry!.directory ? 'deleteTree' : 'delete', path: prompt.entry!.path };
    default: return { type: prompt.kind, path: destination };
  }
}

export type SshFileActions = ReturnType<typeof useSshFileActions>;
