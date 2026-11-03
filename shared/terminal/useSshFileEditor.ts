import { useEffect, useRef, useState } from 'react';
import { SSH_FILE_LIMIT, sshError, type SshApi, type SshEntry } from './ssh';
import { decodeSshText, sshTextUpload, type SshTextContent } from './sshTextFile';
import type { SshDownload } from './sshTransfers';
import { SshUploadCancelled, uploadSshFile } from './sshUpload';

export interface SshEditorDocument extends SshTextContent { entry: SshEntry; savedText: string }
interface Options { api: SshApi; id: string; download: SshDownload; onSaved?: () => void | Promise<unknown> }
type OpenResult = 'opened' | 'downloaded' | undefined;

export function useSshFileEditor({ api, id, download, onSaved }: Options) {
  const [document, setDocument] = useState<SshEditorDocument>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = useRef(document);
  const generation = useRef(0);
  const running = useRef<AbortController>();
  const active = useRef(true);
  const update = (value?: SshEditorDocument) => { current.current = value; setDocument(value); };
  const valid = (version: number) => active.current && generation.current === version;
  const dirty = Boolean(document && document.text !== document.savedText);
  useEffect(() => {
    active.current = true; generation.current++; running.current = undefined;
    update(); setBusy(false); setError('');
    return () => { active.current = false; generation.current++; running.current?.abort(); };
  }, [api, id]);
  const begin = () => {
    const controller = new AbortController(); running.current = controller; setBusy(true); setError('');
    return { controller, version: generation.current };
  };
  const finish = (version: number) => {
    if (valid(version)) { running.current = undefined; setBusy(false); }
  };
  const fail = (failure: unknown, version: number) => {
    if (valid(version) && !(failure instanceof SshUploadCancelled)) {
      setError(sshError(failure, 'client.ssh.fileFailed'));
    }
  };
  const open = async (entry: SshEntry): Promise<OpenResult> => {
    if (!active.current || running.current || entry.directory || current.current) return;
    const { version } = begin();
    try {
      if (entry.size > SSH_FILE_LIMIT) throw new Error('client.ssh.fileTooLarge');
      const response = await api.files(id, { type: 'read', path: entry.path });
      if (!valid(version)) return;
      if (response.type !== 'file') throw new Error('client.ssh.fileFailed');
      const content = decodeSshText(response.data);
      if (content) {
        update({ entry, ...content, savedText: content.text }); return 'opened';
      }
      await download(entry, response.data);
      return valid(version) ? 'downloaded' : undefined;
    } catch (failure) { fail(failure, version); }
    finally { finish(version); }
  };
  const save = async () => {
    const snapshot = current.current;
    if (!active.current || running.current || !snapshot || snapshot.text === snapshot.savedText) return false;
    const { controller, version } = begin();
    try {
      const file = sshTextUpload(snapshot.entry.name, snapshot);
      let overwriteRequested = false;
      await uploadSshFile({ api, id, path: snapshot.entry.path, file, signal: controller.signal,
        progress: () => {}, resolveConflict: async () => {
          // A second conflict can mean the path became a directory. Never retry replacement indefinitely.
          if (overwriteRequested) throw new Error('client.ssh.fileFailed');
          overwriteRequested = true; return 'overwrite';
        } });
      if (!valid(version)) return false;
      update({ ...snapshot, entry: { ...snapshot.entry, size: file.size }, savedText: snapshot.text });
      try { await onSaved?.(); }
      catch (failure) { fail(failure, version); }
      return true;
    } catch (failure) { fail(failure, version); return false; }
    finally { finish(version); }
  };
  const changeText = (text: string) => {
    if (!running.current && current.current) update({ ...current.current, text });
  };
  const close = () => {
    if (running.current) return;
    update(); setError('');
  };
  return { document, busy, error, dirty, open, changeText, save, close };
}
