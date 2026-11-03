import { useRef, useState, type ReactNode } from 'react';
import { useFileDrop, type SubscribeFileDrop } from '../chat/useFileDrop';
import { displayText as t } from '../localization/messages';
import { browserSshUploadBatch, droppedSshFiles, releaseSshUploadBatch, type SshUploadBatch } from './sshDrop';

export interface SshNativeDrop {
  subscribe?: SubscribeFileDrop;
  read: (paths: string[]) => Promise<SshUploadBatch>;
}

interface Props {
  id: string; path: string; active: boolean; disabled?: boolean; children: ReactNode;
  className?: string; native?: SshNativeDrop;
  resolveDirectory?: (target: Element | null) => string;
  upload: (batch: SshUploadBatch) => Promise<void>;
  report: (error: unknown) => void;
}

/** Both native and browser drops use the same queue, conflicts and cancellation as the upload button. */
export function SshDropTarget({ id, path, active, disabled = false, children, className = '', native,
  upload, report, resolveDirectory }: Props) {
  const target = useRef<HTMLDivElement>(null);
  const [destination, setDestination] = useState(path);
  const directoryFor = (element: Element | null) => resolveDirectory?.(element) ?? path;
  const drop = useFileDrop({ target, scope: id, active, disabled, subscribe: native?.subscribe, report,
    onTargetChange: element => setDestination(directoryFor(element)),
    addFiles: (files, element) => upload({ ...browserSshUploadBatch(files), directory: directoryFor(element) }),
    addPaths: async (paths, current, element) => {
      if (!native) return;
      const directory = directoryFor(element);
      const batch = await native.read(paths);
      if (current()) await upload({ ...batch, directory });
      else await releaseSshUploadBatch(batch);
    } });
  return <div ref={target} className={`ssh-drop-target ${className}`} {...drop.handlers} onDrop={event => {
    if (!native?.subscribe) {
      try { droppedSshFiles(event.dataTransfer); }
      catch (error) {
        event.preventDefault(); event.stopPropagation(); drop.clearDrag(); report(error); return;
      }
    }
    drop.handlers.onDrop(event);
  }}>
    {children}
    {drop.dragging && <div className="ssh-drop-overlay" role="status"><span>
      {t('client.ssh.dropUpload', { path: destination })}
    </span></div>}
  </div>;
}
