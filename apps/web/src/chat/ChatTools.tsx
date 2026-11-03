import { displayText } from '../i18n/index';
import { useContext, useEffect, useState, type ReactNode } from 'react';
import { WorkspaceDrawerContext, workspaceTabId } from '../../../../shared/chat/workspaceDrawer';
import { Popover } from 'antd';
import { FolderSearch, GitBranch, Monitor, SquareTerminal, Wrench } from 'lucide-react';
import type { GuiToolsClient } from '../../../../shared/remote-chat/guiTools';
import { useDesktopLauncher } from '../../../../shared/remote-desktop/useDesktopLauncher';
import { ChatTerminal, type ChatTerminalPanel } from './ChatTerminal';
import { ChatGit } from './git/ChatGit';
import { RemoteDesktop } from './desktop/RemoteDesktop';
import { t } from '../i18n';
import './git/git.css';
import { ProjectBrowserDrawer } from './projectBrowser/ProjectBrowserDrawer';
import { useDesktopLayout } from '../useDesktopLayout';
import { useProjectBrowsers } from '../../../../shared/project-browser/useProjectBrowsers';

interface Props {
  client: GuiToolsClient; cwd: string; active: boolean; connected: boolean; deviceName?: string;
  desktopActions?: ReactNode;
  terminal?: ChatTerminalPanel;
}
export function ChatTools(props: Props) {
  const browsers = useProjectBrowsers();
  const desktop = useDesktopLauncher();
  const desktopLayout = useDesktopLayout();
  const wide = desktopLayout && Boolean(props.desktopActions);
  const workspace = useContext(WorkspaceDrawerContext);
  return <>
    {wide && props.desktopActions}
    <ProjectTools key={props.cwd} {...props} wide={wide} openDesktop={desktop.open} openFiles={() => {
      const id = workspaceTabId.files(props.cwd);
      if (!workspace?.tabs.entries.some(tab => tab.id === id)) browsers.open(props.cwd);
      workspace?.tabs.open(id);
    }} />
    {browsers.projects.map(project => <ProjectBrowserDrawer key={project} client={props.client.projectBrowser}
      cwd={project} active={props.active && browsers.visible === project}
      connected={props.connected} onClose={browsers.close} />)}
    {desktop.opened && <RemoteDesktop client={props.client.desktop} active={props.active} connected={props.connected}
      close={desktop.close} />}
  </>;
}

function ProjectTools({ client, openFiles, wide, terminal, ...props }: Props & {
  openFiles: () => void; openDesktop: () => void; wide: boolean;
}) {
  const workspace = useContext(WorkspaceDrawerContext);
  const [menu, setMenu] = useState(false);
  const [launchId, setLaunchId] = useState(0);
  const [git, setGit] = useState(false);
  useEffect(() => { if (!props.active) setMenu(false); }, [props.active]);
  return <>
    {!wide && <Popover trigger="click" placement="bottomRight" arrow={false}
      open={menu && props.active} onOpenChange={setMenu} styles={{ root: { maxWidth: 400 } }}
      content={<div className="chat-tools-menu">
        <button type="button" disabled={!props.connected}
          onClick={() => { setMenu(false); props.openDesktop(); }}>
          <Monitor size={20} />{t("client.remoteDesktop.remoteDesktop")}</button>
        <button type="button" disabled={!props.connected}
          onClick={() => { setMenu(false); setLaunchId(value => value + 1); }}>
          <SquareTerminal size={20} />{t("client.projectBrowser.terminal")}</button>
        <button type="button" onClick={() => {
          setMenu(false); setGit(true); workspace?.tabs.open(workspaceTabId.git(props.cwd));
        }}>
          <GitBranch size={20} />{displayText('Git')}</button>
        <button type="button" disabled={!props.connected || !props.cwd}
          onClick={() => { setMenu(false); openFiles(); }}>
          <FolderSearch size={20} />{t("client.projectBrowser.browseFiles")}</button>
      </div>}>
      <button type="button" className="chat-terminal-toggle" aria-label={t("client.git.openTools")}
        aria-expanded={menu && props.active}>
        <Wrench size={22} /></button>
    </Popover>}
    <ChatTerminal {...props} client={client.terminal} panel={terminal} launchId={launchId} hideTrigger={!wide} />
    {git && <ChatGit {...props} client={client.git} onClose={() => setGit(false)} />}
  </>;
}
