import { displayText } from "../../../i18n/uiText";
import { useCallback, useContext, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, FolderSearch, Plus } from "lucide-react";
import { Drawer, Tooltip } from "antd";
import { MAX_TERMINAL_TABS, type TerminalPanelState, type TerminalTab } from "./useTerminalPanel";
import { useTerminalResize } from "./useTerminalResize";
import { useTerminalSession } from "./useTerminalSession";
import type { TerminalApi } from "../../../../../../shared/terminal/types";
import styles from "./terminal.module.less";
import { TerminalKeys } from './TerminalKeys';
import { TerminalLinkMenu, type TerminalLinkTarget } from './TerminalLinkMenu';
import { SshMenu } from '../../../../../../shared/terminal/SshMenu';
import { SshFiles, sshFilesTabId } from '../../../../../../shared/terminal/SshFiles';
import { SshProjectBrowser } from '../../../../../../shared/terminal/SshProjectBrowser';
import { WorkspaceDrawerContext } from '../../../../../../shared/chat/workspaceDrawer';
import { TerminalTabStrip } from './TerminalTabStrip';
import { useGuiLanguage } from '../../../i18n/useGuiLanguage';
import { SshDropTarget } from '../../../../../../shared/terminal/SshDropTarget';
import { useSshDropQueue } from '../../../../../../shared/terminal/useSshDropQueue';
import type { SshUploadBatch } from '../../../../../../shared/terminal/sshDrop';
import { sshError } from '../../../../../../shared/terminal/ssh';
import { nativeSshUploadBatch, subscribeSshFileDrop } from './sshDrop';
import { getSshDirectory, subscribeSshDirectory } from '../../../../../../shared/terminal/sshDirectory';
import { ZmodemDialog } from '../../../../../../shared/terminal/ZmodemDialog';
import { enqueueSshDownload } from '../../../../../web/src/downloads/sshDownload';

const nativeDrop = { subscribe: subscribeSshFileDrop, read: nativeSshUploadBatch };

export default function TerminalPanel({ panel, active, api, fill = false, translate = displayText, notice, empty }: {
  panel: TerminalPanelState; active: boolean; api: TerminalApi; fill?: boolean;
  translate?: (source: string, values?: { number: number }) => string;
  notice?: string;
  empty?: ReactNode;
}) {
  useGuiLanguage();
  const host = useRef<HTMLElement>(null);
  const resize = useTerminalResize(host);
  const visible = panel.open && active;
  const workspace = useContext(WorkspaceDrawerContext);
  const [fileTabs, setFileTabs] = useState<string[]>([]);
  const [mobileFiles, setMobileFiles] = useState<string>();
  const selectedSession = panel.tabs.find(tab => tab.id === panel.selected)?.session;
  const uploads = useSshDropQueue(panel.tabs.flatMap(tab => tab.session?.ssh ? [tab.session.id] : []));
  const openFiles = (id: string) => {
    setFileTabs(previous => previous.includes(id) ? previous : [...previous, id]);
    if (fill) { setMobileFiles(id); return; }
    workspace?.tabs.open(sshFilesTabId(id));
  };
  return <section ref={host} className={`${styles.panel} ${fill ? styles.fill : ''}`}
    hidden={!visible} aria-label={translate("client.projectBrowser.terminal")} style={fill ? undefined : { height: resize.height }}>
    {!fill && <div className={styles.resize} role="separator" tabIndex={0} aria-label={translate("client.chat.resizeTerminalHeight")}
      aria-orientation="horizontal" aria-valuemin={resize.minimum} aria-valuemax={resize.maximum}
      aria-valuenow={resize.height} {...resize.handle} />}
    <div className={styles.toolbar}>
      <TerminalTabStrip tabs={panel.tabs} selected={panel.selected} select={panel.select}
        remove={panel.remove} translate={translate} />
      <Tooltip title={translate("client.chat.newTerminal")} styles={{ root: { maxWidth: 400 } }}>
        <button className={styles.iconButton} aria-label={translate("client.chat.newTerminal")} onClick={panel.add}
          disabled={panel.tabs.length >= MAX_TERMINAL_TABS}><Plus size={18} /></button>
      </Tooltip>
      {api.ssh && panel.adopt && <SshMenu key={panel.projectCwd} api={api.ssh} projectCwd={panel.projectCwd ?? ''}
        adopt={panel.adopt} close={api.close} className={styles.iconButton}
        disabled={panel.tabs.length >= MAX_TERMINAL_TABS} />}
      {api.ssh && selectedSession?.ssh && <Tooltip title={translate('client.ssh.files')}
        styles={{ root: { maxWidth: 400 } }}>
        <button className={`${styles.iconButton} ${styles.close}`} aria-label={translate('client.ssh.files')}
          onClick={() => openFiles(selectedSession.id)}><FolderSearch size={17} /></button>
      </Tooltip>}
      {!fill && <button className={`${styles.iconButton} ${styles.close}`}
        style={selectedSession?.ssh ? { marginLeft: 0 } : undefined}
        aria-label={translate("client.chat.hideTerminal")} onClick={panel.hide}><ChevronDown size={17} /></button>}
    </div>
    {notice && <div className={styles.status} role="alert">{translate(notice)}</div>}
    {!panel.tabs.length && empty}
    {panel.tabs.map((tab) => <TerminalPane key={tab.id} tab={tab} api={api} translate={translate} shortcuts={fill}
      onExit={() => panel.exited?.(tab.id)}
      upload={async batch => {
        if (!tab.session) return;
        openFiles(tab.session.id);
        await uploads.enqueue(tab.session.id, batch);
      }} uploadPending={uploads.pending.some(value => value.id === tab.session?.id)}
      visible={visible && panel.selected === tab.id} />)}
    {api.ssh && !fill && panel.tabs.filter(tab => tab.session?.ssh && fileTabs.includes(tab.session.id)).map(tab =>
      <SshFiles key={tab.id} info={tab.session!} api={api.ssh!} active={active} nativeDrop={nativeDrop}
        download={file => enqueueSshDownload(api.ssh!, tab.session!.id, file)}
        pendingUpload={uploads.pending.find(value => value.id === tab.session!.id)} />)}
    {api.ssh && fill && panel.tabs.filter(tab => tab.session?.ssh && fileTabs.includes(tab.session.id)).map(tab =>
      <Drawer key={tab.id} open={visible && mobileFiles === tab.session!.id} placement="bottom" height="100%"
      rootClassName="ssh-files-drawer" title={translate('client.ssh.files')} onClose={() => setMobileFiles(undefined)}
      closable={{ 'aria-label': translate('client.ssh.backToTerminal'), placement: 'end' }}>
      <SshProjectBrowser id={tab.session!.id} api={api.ssh!} nativeDrop={nativeDrop}
        download={file => enqueueSshDownload(api.ssh!, tab.session!.id, file)}
        active={visible && mobileFiles === tab.session!.id}
        pendingUpload={uploads.pending.find(value => value.id === tab.session!.id)} />
    </Drawer>)}
  </section>;
}

function TerminalPane({ tab, visible, api, translate, shortcuts, upload, uploadPending, onExit }: {
  tab: TerminalTab; visible: boolean; api: TerminalApi; translate: (source: string) => string;
  shortcuts: boolean;
  onExit: () => void;
  upload: (batch: SshUploadBatch) => Promise<void>; uploadPending: boolean;
}) {
  const [link, setLink] = useState<TerminalLinkTarget>();
  const [dropError, setDropError] = useState('');
  const sessionId = tab.session?.id ?? '';
  const directory = useSyncExternalStore(callback => subscribeSshDirectory(sessionId, callback),
    () => getSshDirectory(sessionId));
  const closeLink = useCallback(() => setLink(undefined), []);
  const { host, info, status, input, transfer } = useTerminalSession({ cwd: tab.cwd, visible, api,
    session: tab.session, npmScript: tab.npmScript, onExit, onLink: setLink });
  const content = <>
    <div ref={host} className={styles.screen} aria-label={info?.shell ?? translate("client.projectBrowser.terminal")} />
    {dropError && <div className={styles.status} role="alert">{translate(dropError)}</div>}
    {status && <div className={styles.status} role="status">{translate(status)}</div>}
    {shortcuts && <TerminalKeys input={input} />}
  </>;
  return <div className={styles.pane} hidden={!visible} role="tabpanel" id={`terminal-pane-${tab.id}`}
    aria-labelledby={`terminal-tab-${tab.id}`}>
    {tab.session?.ssh ? <SshDropTarget id={tab.session.id} path={directory || info?.cwd || tab.session.cwd || '.'}
      active={visible} disabled={uploadPending} native={nativeDrop} upload={async batch => {
        setDropError(''); await upload({ ...batch, directory: getSshDirectory(tab.session!.id) });
      }} report={error => setDropError(sshError(error, 'client.ssh.fileFailed'))}>{content}</SshDropTarget> : content}
    {link && visible && <TerminalLinkMenu key={`${link.url}:${link.x}:${link.y}`} target={link} id={info?.id}
      api={api} close={closeLink} translate={translate} />}
    <ZmodemDialog transfer={transfer} visible={visible} translate={translate} />
  </div>;
}
