import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Checkbox, Input, Progress, Spin, Tooltip } from 'antd';
import { ArrowRight, ArrowUp, FilePlus, Folder, FolderPlus, Home, RefreshCw, Search, Upload } from 'lucide-react';
import { WorkspaceDrawerTab } from '../chat/WorkspaceDrawerTab';
import { displayText as t } from '../localization/messages';
import { remoteErrorText } from '../localization/errors';
import type { TerminalInfo } from './types';
import type { SshApi } from './ssh';
import { sshParent, useSshFiles } from './useSshFiles';
import { useSshFileActions } from './useSshFileActions';
import { SshFileDialogs } from './SshFileDialogs';
import { SshFileList } from './SshFileList';
import { SshDropTarget, type SshNativeDrop } from './SshDropTarget';
import { releaseSshUploadBatch, type SshUploadBatch } from './sshDrop';
import type { PendingSshUpload } from './useSshDropQueue';
import { browserSshDownload } from './sshTransfers';
import { useSshFileEditor } from './useSshFileEditor';
import { SshFileEditor } from './SshFileEditor';
import { SshProjectBrowser } from './SshProjectBrowser';
import './ssh.css';
import type { BrowserHost } from '../project-browser/entryActions';

export const sshFilesTabId = (id: string) => `ssh-files:${id}`;
const ICON = <Folder size={16} />;

interface DropProps { nativeDrop?: SshNativeDrop; pendingUpload?: PendingSshUpload }

export function SshFiles({ info, api, active, download, ...drop }: {
  info: TerminalInfo; api: SshApi; active: boolean; download?: BrowserHost['download'];
} & DropProps) {
  return <WorkspaceDrawerTab active={active} autoOpen
    tab={{ id: sshFilesTabId(info.id), title: t('client.ssh.filesTitle', { host: info.ssh?.host ?? '' }), icon: ICON }}>
    {visible => <SshProjectBrowser key={info.id} api={api} id={info.id} active={active && visible}
      download={download} {...drop} />}
  </WorkspaceDrawerTab>;
}

export function SshFileBrowser({ api, id, active = true, nativeDrop, pendingUpload }: {
  api: SshApi; id: string; active?: boolean;
} & DropProps) {
  const browserFiles = useSshFiles(api, id);
  const editor = useSshFileEditor({ api, id, download: browserSshDownload, onSaved: () => browserFiles.load() });
  const files = { ...browserFiles, busy: browserFiles.busy || editor.busy || Boolean(editor.document) };
  const actions = useSshFileActions(files);
  const [address, setAddress] = useState<string>();
  const [filter, setFilter] = useState('');
  const [hidden, setHidden] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const accepted = useRef<PendingSshUpload>();
  useEffect(() => {
    if (pendingUpload && !files.loaded && files.error) { pendingUpload.complete(); return; }
    if (!pendingUpload || accepted.current === pendingUpload || files.busy || !files.loaded) return;
    accepted.current = pendingUpload;
    void actions.uploadSources(pendingUpload.batch.files, { directory: pendingUpload.batch.directory })
      .finally(pendingUpload.complete);
  }, [pendingUpload, files.busy, files.loaded, files.error, actions.uploadSources]);
  useEffect(() => () => { accepted.current?.complete(); }, []);
  const upload = async (batch: SshUploadBatch) => {
    try { await actions.uploadSources(batch.files, { directory: batch.directory }); }
    finally { await releaseSshUploadBatch(batch); }
  };
  const open = (path: string) => { setAddress(undefined); void files.navigate(path); };
  const action = (key: string, icon: ReactNode, invoke: () => void, disabled = false) =>
    <Tooltip title={t(key)} styles={{ root: { maxWidth: 400 } }}><Button icon={icon} aria-label={t(key)}
      type={key === 'client.ssh.upload' ? 'primary' : 'text'}
      disabled={files.busy || disabled} onClick={invoke} /></Tooltip>;
  const entries = files.entries.filter(entry => (hidden || !entry.name.startsWith('.'))
    && entry.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  return <SshDropTarget id={id} path={files.path} active={active} disabled={files.busy || !files.loaded}
    native={nativeDrop} upload={upload} report={files.reportError}>
    <div className="ssh-files" aria-busy={files.busy}>
    <div className="ssh-file-controls">
    <div className="ssh-file-toolbar">
      <div className="ssh-file-navigation">
        {action('client.ssh.home', <Home size={19} />, () => open('.'))}
        {action('client.ssh.parent', <ArrowUp size={19} />, () => open(sshParent(files.path)), files.path === '/')}
        {action('client.ssh.refresh', files.busy ? <Spin size="small" /> : <RefreshCw size={19} />,
          () => void files.load())}
      </div>
      <div className="ssh-file-tools">
        {action('client.ssh.newFile', <FilePlus size={19} />, () => actions.create('createFile'))}
        {action('client.ssh.newFolder', <FolderPlus size={19} />, () => actions.create('createFolder'))}
        {action('client.ssh.upload', <Upload size={19} />, () => input.current?.click())}
      </div>
      <input hidden type="file" multiple ref={input} onChange={event => {
        const selected = event.currentTarget.files;
        if (selected?.length) void actions.upload(selected);
        event.currentTarget.value = '';
      }} />
    </div>
    <form className="ssh-file-path" onSubmit={event => {
      event.preventDefault(); open(address ?? files.path);
    }}>
      <Folder size={16} aria-hidden="true" />
      <Input value={address ?? files.path} aria-label={t('client.ssh.path')} variant="borderless"
        onChange={event => setAddress(event.target.value)} disabled={files.busy} />
      <Tooltip title={t('client.ssh.go')} styles={{ root: { maxWidth: 400 } }}>
        <Button htmlType="submit" type="text" icon={<ArrowRight size={19} />}
          aria-label={t('client.ssh.go')} disabled={files.busy} />
      </Tooltip>
    </form>
    <Input className="ssh-file-search" prefix={<Search size={17} aria-hidden="true" />}
      value={filter} onChange={event => setFilter(event.target.value)} allowClear
      placeholder={t('client.ssh.filter')} aria-label={t('client.ssh.filter')} />
    <Checkbox checked={hidden} onChange={event => setHidden(event.target.checked)}>{t('client.ssh.hidden')}</Checkbox>
    {files.error && <Alert type="error" role="alert" message={remoteErrorText(files.error)} />}
    {!editor.document && editor.error && <Alert type="error" role="alert" message={remoteErrorText(editor.error)} />}
    {actions.copyStatus && <Alert type={actions.copyStatus === 'client.ssh.pathCopied' ? 'success' : 'error'}
      message={t(actions.copyStatus)} />}
    {files.truncated && <Alert type="info" message={t('client.ssh.truncated')} />}
    {files.progress && <div className="ssh-upload-progress" role="status">
      <span>{t('client.ssh.uploadingFile', { name: files.progress.name })}</span>
      <Progress percent={files.progress.total ? Math.floor(files.progress.sent / files.progress.total * 100) : 0}
        size="small" />
      <Button size="small" onClick={files.cancelUpload}>{t('client.ssh.cancelUpload')}</Button>
    </div>}
    </div>
    <SshFileList files={files} actions={actions} entries={entries}
      open={entry => entry.directory ? open(entry.path) : void editor.open(entry)}
      upload={() => input.current?.click()} />
    <SshFileDialogs files={files} actions={actions} />
    <SshFileEditor editor={editor} />
  </div></SshDropTarget>;
}
