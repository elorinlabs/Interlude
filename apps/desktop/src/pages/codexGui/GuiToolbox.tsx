import { uiText } from "../../i18n/uiText";
import { lazy, Suspense, useContext, useEffect, useState } from 'react';
import { WorkspaceDrawerContext, workspaceTabId } from '../../../../../shared/chat/workspaceDrawer';
import { Button, Popover } from 'antd';
import { GitBranch, Wrench } from 'lucide-react';
import type { GitClient } from '../../../../../shared/remote-chat/gitTypes';
import styles from './GuiToolbox.module.less';
import workspaceStyles from './WorkspacePicker.module.less';
import '../../../../web/src/chat/terminal.css';
import '../../../../web/src/chat/git/git.css';

const ChatGit = lazy(() => import('../../../../web/src/chat/git/ChatGit')
  .then(module => ({ default: module.ChatGit })));

interface Props {
  active: boolean; connected: boolean; cwd: string;
  git: GitClient;
  trigger?: 'toolbox' | 'git';
}

export function GuiToolbox(props: Props) {
  const workspace = useContext(WorkspaceDrawerContext);
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState<'git' | null>(null);
  useEffect(() => { if (!props.active) setMenu(false); }, [props.active]);
  const openGit = () => { setPanel('git'); workspace?.tabs.open(workspaceTabId.git(props.cwd)); };
  const gitVisible = workspace?.tabs.visible && workspace.tabs.selected === workspaceTabId.git(props.cwd);
  return <>
    {props.trigger === 'git' ? <button type="button" className={workspaceStyles.trigger}
      disabled={!props.active || !props.connected || !props.cwd}
      aria-label={uiText("client.workspaceActions.openGit")} aria-haspopup="dialog" aria-expanded={Boolean(gitVisible)}
      onClick={openGit}><GitBranch size={16} /><span>Git</span></button>
      : <Popover trigger="click" placement="bottomRight" open={menu && props.active} onOpenChange={setMenu}
      styles={{ root: { maxWidth: 400 } }} content={<div className={styles.menu} aria-label={uiText("client.workspaceSettings.toolbox")}>
        <button type="button" disabled={!props.connected} onClick={() => { setMenu(false); openGit(); }}>
          <GitBranch size={18} /><span>Git</span></button>
      </div>}>
      <Button type="text" icon={<Wrench size={16} />} title={menu || panel ? undefined : uiText("client.workspaceSettings.toolbox")}
        aria-label={uiText("client.workspaceSettings.openToolbox")} aria-expanded={menu && props.active} />
    </Popover>}
    <Suspense fallback={null}>
      {panel === 'git' && <ChatGit key={props.cwd} client={props.git} cwd={props.cwd}
        connected={props.connected} active={props.active} desktopDiffs
        onClose={() => setPanel(null)} />}
    </Suspense>
  </>;
}
