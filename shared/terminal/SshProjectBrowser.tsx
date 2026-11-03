import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Progress, Spin } from 'antd';
import { Upload } from 'lucide-react';
import { ProjectBrowser } from '../project-browser/ProjectBrowser';
import type { BrowserHost } from '../project-browser/entryActions';
import { displayText as t } from '../localization/messages';
import { remoteErrorText } from '../localization/errors';
import { getSshProjectClient } from './sshProjectClient';
import { SshProjectToolbar } from './SshProjectToolbar';
import { SshHiddenFilesMenuItem } from './SshHiddenFilesMenuItem';
import { useSshFiles } from './useSshFiles';
import { useSshFileActions } from './useSshFileActions';
import { SshFileDialogs } from './SshFileDialogs';
import { SshDropTarget, type SshNativeDrop } from './SshDropTarget';
import { browserSshUploadBatch, releaseSshUploadBatch, sshDropDirectory, type SshUploadBatch } from './sshDrop';
import type { PendingSshUpload } from './useSshDropQueue';
import type { SshApi } from './ssh';
import './sshProjectBrowser.css';
import { browserFileRenderer } from '../file-preview/BrowserFilePreview';
import { sshPreviewLoader } from '../file-preview/sshLoader';

export function SshProjectBrowser({ api, id, active, nativeDrop, pendingUpload, download: managedDownload }: {
  api: SshApi; id: string; active: boolean; nativeDrop?: SshNativeDrop; pendingUpload?: PendingSshUpload;
  download?: BrowserHost['download'];
}) {
  const files = useSshFiles(api, id);
  const actions = useSshFileActions(files);
  const [hidden, setHidden] = useState(true);
  const accepted = useRef<PendingSshUpload>();
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadDirectory = useRef('');
  const { client, download } = useMemo(() => getSshProjectClient(api, id), [api, id]);
  const renderPreview = useMemo(() => browserFileRenderer(sshPreviewLoader(api, id)), [api, id]);
  const host = useMemo<BrowserHost>(() => ({
    copyPath: path => navigator.clipboard.writeText(path), download: managedDownload ?? download, downloadDirectory: false,
    entryActions: ['createFile', 'createFolder', 'rename', 'move', 'delete'],
  }), [download, managedDownload]);
  useEffect(() => {
    if (pendingUpload && !files.loaded && files.error) { pendingUpload.complete(); return; }
    if (!pendingUpload || accepted.current === pendingUpload || files.busy || !files.loaded) return;
    accepted.current = pendingUpload;
    void actions.uploadSources(pendingUpload.batch.files, { directory: pendingUpload.batch.directory })
      .finally(pendingUpload.complete);
  }, [pendingUpload, files.busy, files.loaded, files.error, actions.uploadSources]);
  useEffect(() => () => { accepted.current?.complete(); }, []);
  const upload = async (batch: SshUploadBatch) => {
    try { await actions.uploadSources(batch.files, { directory: batch.directory, preserveDirectory: true }); }
    finally { await releaseSshUploadBatch(batch); }
  };
  const pickUpload = (directory: string) => {
    if (files.busy) return;
    uploadDirectory.current = directory;
    uploadInput.current?.click();
  };
  return <SshDropTarget id={id} path={files.path} active={active} disabled={files.busy || !files.loaded}
    resolveDirectory={target => sshDropDirectory(target, files.path)}
    native={nativeDrop} upload={upload} report={files.reportError}>
    <div className="ssh-project-browser" aria-busy={files.busy}>
      <input type="file" hidden multiple ref={uploadInput} onChange={event => {
        const selected = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = '';
        if (selected.length) void upload({ ...browserSshUploadBatch(selected), directory: uploadDirectory.current });
      }} />
      {files.error && <p className="ssh-project-feedback" role="alert">{remoteErrorText(files.error)}</p>}
      {!files.loaded && <div className="ssh-project-loading" role="status">
        {files.busy ? <Spin /> : <Button onClick={() => void files.load()}>{t('client.terminal.retry')}</Button>}
      </div>}
      {files.loaded && <ProjectBrowser client={client} cwd="/" connected active={active} t={t} host={host} onClose={() => {}}
        renderPreview={renderPreview}
        treeOptions={{ root: files.path, showHidden: hidden, revision: files.entries,
          renderMenuExtras: (entry, close) => entry.directory && <button type="button" role="menuitem"
            disabled={files.busy} onClick={() => { close(); pickUpload(entry.path); }}>
            <Upload size={16} /><span>{t('client.ssh.uploadToFolder')}</span>
          </button>,
          renderRootMenuExtras: close => <SshHiddenFilesMenuItem hidden={hidden} disabled={files.busy}
            toggle={() => { setHidden(!hidden); close(); }} />,
          renderToolbar: ({ refresh, menu }) => <SshProjectToolbar path={files.path} disabled={files.busy}
            actions={<>{refresh}{menu}</>}
            navigate={path => { void files.navigate(path); }} pickUpload={() => pickUpload(files.path)} />,
        }} />}
      {files.progress && <div className="ssh-upload-progress ssh-project-feedback" role="status">
        <span>{t('client.ssh.uploadingFile', { name: files.progress.name })}</span>
        <Progress percent={files.progress.total ? Math.floor(files.progress.sent / files.progress.total * 100) : 0}
          size="small" />
        <Button size="small" onClick={files.cancelUpload}>{t('client.ssh.cancelUpload')}</Button>
      </div>}
      <SshFileDialogs files={files} actions={actions} />
    </div>
  </SshDropTarget>;
}
