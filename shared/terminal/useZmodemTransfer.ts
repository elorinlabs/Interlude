import { useCallback, useEffect, useRef, useState } from 'react';
import type { TerminalApi, TerminalInfo } from './types';
import { ZmodemTransfer, type ZmodemState } from './zmodem';

export interface ZmodemDownload { name: string; url: string }

export function useZmodemTransfer(api: TerminalApi, session?: TerminalInfo) {
  const controller = useRef<ZmodemTransfer>();
  const urls = useRef<string[]>([]);
  const [state, setState] = useState<ZmodemState>();
  const [downloads, setDownloads] = useState<ZmodemDownload[]>([]);
  const release = useCallback(() => {
    urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current = [];
    setDownloads([]);
  }, []);
  useEffect(() => release, [release]);
  const bind = useCallback((output: (bytes: number[]) => void) => {
    if (!session?.ssh || !api.writeBinary) return;
    const transfer = new ZmodemTransfer({ output,
      write: bytes => api.writeBinary!(session.id, bytes),
      binaryMode: api.binaryMode ? (token, enabled) => api.binaryMode!(session.id, token, enabled) : undefined,
      change: next => {
        setState(next);
        if (next?.phase === 'offer') release();
      },
      file: (name, chunks) => {
        const url = URL.createObjectURL(new Blob(chunks));
        urls.current.push(url); setDownloads(previous => [...previous, { name, url }]);
      },
    });
    controller.current = transfer;
    return transfer;
  }, [api, session, release]);
  return { bind, state, downloads,
    prepareUpload: () => controller.current?.prepareUpload(),
    cancel: () => controller.current?.cancel(),
    dismiss: () => { setState(undefined); release(); },
    accept: (files: File[] = []) => controller.current?.accept(files.map(file => ({
      name: file.name, size: file.size, mtime: new Date(file.lastModified),
      read: async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
    }))),
  };
}
