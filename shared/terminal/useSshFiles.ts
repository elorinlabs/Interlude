import { useEffect, useRef, useState } from 'react';
import { SSH_FILE_LIMIT, sshError, type SshApi, type SshEntry, type SshFileAction } from './ssh';
import { browserSshDownload, type SshDownload, type SshUpload } from './sshTransfers';
import { SshUploadCancelled, uploadSshFile, type SshResolveConflict, type SshUploadProgress } from './sshUpload';
import { getSshDirectory, requestSshDirectory, subscribeSshDirectory } from './sshDirectory';

export const sshParent = (path: string) => path.replace(/\/+$/, '').slice(0, path.replace(/\/+$/, '').lastIndexOf('/')) || '/';
export const sshChild = (path: string, name: string) => `${path.replace(/\/+$/, '')}/${name}`;
export const validSshName = (name: string) => Boolean(name && name !== '.' && name !== '..'
  && name.length <= 255 && !/[\/\x00-\x1f\x7f]/.test(name));

export interface SshUploadOptions {
  directory?: string;
  preserveDirectory?: boolean;
}

export function useSshFiles(api: SshApi, id: string, saveDownload: SshDownload = browserSshDownload) {
  const [path, setPath] = useState('.');
  const [entries, setEntries] = useState<SshEntry[]>([]);
  const [selected, select] = useState<SshEntry>();
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [progress, setProgress] = useState<SshUploadProgress>();
  const uploadController = useRef<AbortController>();
  const active = useRef(true);
  const running = useRef(false);
  const currentPath = useRef('.');
  const pendingDirectory = useRef<string>();
  const run = async (action: () => Promise<unknown>) => {
    if (running.current) return false;
    running.current = true; setBusy(true); setError('');
    try { await action(); return true; }
    catch (failure) {
      if (active.current && !(failure instanceof SshUploadCancelled)) setError(sshError(failure, 'client.ssh.fileFailed'));
      return false;
    }
    finally {
      running.current = false;
      if (active.current) { setBusy(false); followDirectory(); }
    }
  };
  const list = async (directory: string) => {
    const response = await api.files(id, { type: 'list', path: directory });
    if (response.type !== 'list' || !active.current) return;
    currentPath.current = response.path;
    setPath(response.path); setEntries(response.entries); setTruncated(response.truncated); select(undefined);
    setLoaded(true);
    return response.path;
  };
  const load = (directory = path) => run(() => list(directory));
  const navigate = (directory: string) => run(async () => {
    const resolved = await list(directory);
    if (resolved) requestSshDirectory(id, resolved);
  });
  const followDirectory = () => {
    const directory = pendingDirectory.current;
    if (!directory || running.current) return;
    pendingDirectory.current = undefined;
    if (directory !== currentPath.current) void load(directory);
  };
  useEffect(() => {
    active.current = true; setLoaded(false);
    void load(getSshDirectory(id) ?? '.');
    const unsubscribe = subscribeSshDirectory(id, () => {
      pendingDirectory.current = getSshDirectory(id); followDirectory();
    });
    return () => { active.current = false; unsubscribe(); uploadController.current?.abort(); };
  }, [api, id]);
  const mutate = (request: SshFileAction) => run(async () => {
    await api.files(id, request); await list(path);
  });
  const download = (entry: SshEntry) => run(async () => {
    if (entry.size > SSH_FILE_LIMIT) throw new Error('client.ssh.fileTooLarge');
    const response = await api.files(id, { type: 'read', path: entry.path });
    if (response.type !== 'file' || !active.current) return;
    await saveDownload(entry, response.data);
  });
  const uploadMany = (selected: SshUpload[], resolveConflict?: SshResolveConflict,
    options: SshUploadOptions = {}) => run(async () => {
    if (selected.some(file => !validSshName(file.name))) throw new Error('client.ssh.invalidName');
    const destination = options.directory ?? currentPath.current;
    const refreshDirectory = options.preserveDirectory ? currentPath.current : destination;
    const controller = new AbortController(); uploadController.current = controller;
    try {
      for (const file of selected) {
        await uploadSshFile({ api, id, path: sshChild(destination, file.name), file, signal: controller.signal,
          resolveConflict, progress: value => { if (active.current) setProgress(value); } });
      }
      if (active.current) await list(refreshDirectory);
    } finally { uploadController.current = undefined; if (active.current) setProgress(undefined); }
  });
  const upload = (file: SshUpload, resolveConflict?: SshResolveConflict) => uploadMany([file], resolveConflict);
  return { path, entries, selected, select, busy, loaded, error, truncated, load, navigate, mutate, download,
    upload, uploadMany, progress, reportError: (failure: unknown) => setError(sshError(failure, 'client.ssh.fileFailed')),
    cancelUpload: () => uploadController.current?.abort() };
}
