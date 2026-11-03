import { useEffect, useRef, useState } from 'react';
import { ClipboardReadUnavailableError, type ClipboardContent, type LocalDesktopClipboard }
  from '../../../../../shared/remote-desktop/clipboard';
import type { DesktopClipboard } from '../../../../../shared/remote-desktop/clipboardTransfer';
import { ClipboardOrigin } from '../../../../../shared/remote-desktop/clipboardOrigin';
import { MISSING_CLIPBOARD_IMAGES, readPastedContent } from '../../../../../shared/chat/clipboard';
import { browserDesktopClipboard, downloadClipboardFile, filesContent, readBrowserClipboardBaseline }
  from './clipboardContent';
import { useClipboardQueue } from './useClipboardQueue';
import { useNativeFileClipboard, type FileClipboardSession } from './useNativeFileClipboard';

interface Options {
  active: boolean; connected?: boolean;
  clipboard: Pick<DesktopClipboard, 'read' | 'write' | 'copy' | 'paste'> & FileClipboardSession & { syncEnabled?: boolean };
  localClipboard?: LocalDesktopClipboard;
}
export function useDesktopClipboard({ active, connected = active, clipboard, localClipboard }: Options) {
  const sync = clipboard.syncEnabled !== false;
  const { local, streaming } = useNativeFileClipboard(localClipboard ?? browserDesktopClipboard, clipboard, connected && sync);
  const [open, setOpen] = useState(false);
  const [received, setReceived] = useState<ClipboardContent>();
  const [needsSave, setNeedsSave] = useState(false);
  const { busy, status, progress, setStatus, run, report } = useClipboardQueue(active && sync, open);
  const origin = useRef(new ClipboardOrigin());
  const pendingCopies = useRef(0);
  useEffect(() => {
    if (!active || !sync) { setOpen(false); setReceived(undefined); setNeedsSave(false); }
    return () => { origin.current.reset(); pendingCopies.current = 0; };
  }, [active, sync]);

  const readLocalForPaste = () => local.read().catch(error => {
    if (error instanceof ClipboardReadUnavailableError) return undefined;
    throw error;
  });
  const readBaseline = () => localClipboard ? local.read().catch(() => undefined) : readBrowserClipboardBaseline();
  const readRemote = (shortcut: 'copy' | 'cut' | undefined, progress: ReturnType<typeof report>) => {
    const options: [boolean?] = streaming ? [true] : [];
    return shortcut ? clipboard.copy(shortcut, progress, ...options) : clipboard.read(undefined, progress, ...options);
  };
  const send = (content: () => Promise<ClipboardContent>, fromFiles = false) => {
    void run(async current => {
      const value = await content();
      const baseline = fromFiles ? readBaseline() : Promise.resolve(value);
      if (!current()) return;
      await clipboard.write(value, true, report(current));
      const before = await baseline;
      if (current()) { origin.current.remember(before); setStatus(''); }
    });
  };
  const copy = (shortcut?: 'copy' | 'cut') => {
    if (!active) return;
    if (!sync) {
      if (shortcut) void clipboard.copy(shortcut).catch(() => setStatus('剪贴板操作失败，请重试。'));
      return;
    }
    pendingCopies.current += 1;
    void run(async current => {
      setReceived(undefined); setNeedsSave(false); origin.current.remember();
      // Read the local baseline alongside the remote gesture; local access cannot block native copy/cut.
      const baseline = readBaseline();
      try {
        const content = await readRemote(shortcut, report(current));
        const before = await baseline;
        if (!current()) return;
        origin.current.remember(before);
        if (!content) { setStatus(''); return; }
        setReceived(content);
        if (content.format === 'files' && !local.files) {
          if (content.files.length === 1) downloadClipboardFile(content.files[0]);
          setStatus(content.files.length === 1 ? '' : '文件已收到，点击“下载文件”保存。'); return;
        }
        try {
          await local.write(content);
          if (current()) { origin.current.remember(content); setStatus(''); }
        } catch {
          if (current()) { setStatus('内容已收到，请点击“复制到本机”。'); setNeedsSave(true); }
        }
      } catch (error) {
        const before = await baseline;
        if (current()) origin.current.remember(before);
        throw error;
      } finally { if (current()) pendingCopies.current -= 1; }
    });
  };
  const pasteAutomatic = (read: () => Promise<ClipboardContent | undefined>) => {
    if (!active) return;
    if (!sync) {
      void clipboard.paste(false).catch(() => setStatus('剪贴板操作失败，请重试。')); return;
    }
    // Browser paste data may predate a copy still in flight. Such a gesture belongs to the remote clipboard.
    const copying = pendingCopies.current > 0;
    void run(async current => {
      // Only unavailable clipboard reads may yield undefined; invalid local content must stop the gesture.
      const content = await read();
      if (!current()) return;
      const revision = await clipboard.paste(!copying && origin.current.preferLocal(content));
      if (!current()) return;
      if (revision && content) await clipboard.write(content, true, report(current), revision);
      if (current()) { if (!copying) origin.current.remember(content); setStatus(''); }
    });
  };
  const paste = (data: DataTransfer) => {
    if (localClipboard) { pasteAutomatic(readLocalForPaste); return; }
    const { files, text, missingImages } = readPastedContent(data);
    if (missingImages) {
      void run(async () => { throw new Error(MISSING_CLIPBOARD_IMAGES); }); return;
    }
    if (!files.length && !text) { pasteAutomatic(async () => undefined); return; }
    const image = !data.getData('text/plain');
    pasteAutomatic(() => files.length ? filesContent(files, image) : Promise.resolve({ format: 'text', text }));
  };
  const save = () => {
    if (!active || busy || !received) return;
    // Start the write during the click so browsers can use its clipboard permission.
    const saving = local.write(received).then(() => true, () => false);
    void run(async current => {
      if (!await saving) throw new Error('无法访问剪贴板，请重新复制后再试。');
      if (current()) { origin.current.remember(received); setStatus(''); setNeedsSave(false); }
    });
  };
  return { open, setOpen, busy, status, progress, received, copy, paste, save, needsSave, nativeFiles: local.files,
    nativeFileProgress: clipboard.fileStreaming === true,
    pasteShortcut: localClipboard ? () => pasteAutomatic(readLocalForPaste) : undefined,
    pasteLocal: () => send(local.read), sendFiles: (files: File[]) => send(() => filesContent(files), true) };
}
