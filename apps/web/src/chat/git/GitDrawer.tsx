import { useContext, useEffect, useState, type ReactNode } from 'react';
import { Drawer } from 'antd';
import { GitBranch } from 'lucide-react';
import { WorkspaceDrawerContext, workspaceTabId } from '../../../../../shared/chat/workspaceDrawer';
import { WorkspaceDrawerTab } from '../../../../../shared/chat/WorkspaceDrawerTab';
import { useDesktopLayout } from '../../useDesktopLayout';
import { useGitTheme } from './gitTheme';
import { t } from '../../i18n';

const GIT_ICON = <GitBranch size={16} />;

export function GitDrawer({ active, desktopDiffs, cwd = '', onClose, onVisibilityChange, children }: {
  active: boolean; desktopDiffs?: boolean; cwd?: string; onClose: () => void;
  onVisibilityChange: (visible: boolean) => void;
  children: (visible: boolean) => ReactNode;
}) {
  const workspace = useContext(WorkspaceDrawerContext);
  const desktop = useDesktopLayout();
  const internal = Boolean(workspace && (desktop || desktopDiffs));
  const theme = useGitTheme(Boolean(desktopDiffs));
  const [pageVisible, setPageVisible] = useState(document.visibilityState !== 'hidden');
  const [tabVisible, setTabVisible] = useState(false);
  const visible = (internal ? tabVisible : active) && pageVisible;
  useEffect(() => { onVisibilityChange(visible); }, [visible, onVisibilityChange]);
  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  if (internal) return <WorkspaceDrawerTab active={active} onVisibilityChange={setTabVisible}
    tab={{ id: workspaceTabId.git(cwd), title: 'Git', icon: GIT_ICON }}
    className="chat-git-drawer" style={theme}>
    {() => children(visible)}
  </WorkspaceDrawerTab>;
  return <Drawer open={active} title="Git" placement="bottom" height="90%" onClose={onClose}
    rootStyle={theme} rootClassName="chat-terminal-drawer chat-git-drawer"
    closable={{ 'aria-label': t("client.git.closeGit"), placement: 'end' }}>{children(visible)}</Drawer>;
}
