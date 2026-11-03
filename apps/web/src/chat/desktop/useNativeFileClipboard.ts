import { useEffect, useRef } from 'react';
import type { ClipboardContent, LocalDesktopClipboard } from '../../../../../shared/remote-desktop/clipboard';
import type { FileOffer, FileRead, LocalFileClipboard } from '../../../../../shared/remote-desktop/fileClipboard';

export interface FileClipboardSession {
  fileStreaming?: boolean;
  registerFiles?: (offer: FileOffer, read: (request: FileRead) => Promise<string>) => void;
  readFile?: (request: FileRead) => Promise<string>;
}

/** Minimized viewers still serve Explorer reads; session shutdown revokes outstanding promises. */
export function useNativeFileClipboard(base: LocalDesktopClipboard, remote: FileClipboardSession, connected: boolean) {
  const bridge = useRef<LocalFileClipboard>();
  const installed = useRef<string>();
  const current = useRef(remote); current.current = remote;
  const enabled = !!base.createFileSession && remote.fileStreaming === true;
  useEffect(() => {
    if (!enabled || !connected) return;
    const session = base.createFileSession!(); bridge.current = session;
    return () => { bridge.current = undefined; installed.current = undefined; session.close(); };
  }, [enabled, connected, base.createFileSession]);
  const read = async () => {
    const session = bridge.current;
    const content = await (session ? session.read() : base.read());
    if (content.format === 'fileOffer' && session && content.offer.id !== installed.current) {
      current.current.registerFiles?.(content.offer, request => session.chunk(request));
    }
    return content;
  };
  const write = async (content: ClipboardContent) => {
    if (content.format !== 'fileOffer') return base.write(content);
    const session = bridge.current;
    if (!session || !current.current.readFile) throw new Error('桌面连接已结束，请重新连接后再复制文件。');
    await session.publish(content.offer, request => current.current.readFile!(request));
    installed.current = content.offer.id;
  };
  return { local: { ...base, read, write }, streaming: enabled && connected };
}
