import { uiText } from "../../../i18n/uiText";
import type { ChatController, ChatState } from '../../../../../web/src/chat/types';
import { directoryProject } from '../../../../../../shared/remote-chat/projectDirectories';
import { RemoteProjectPicker } from './RemoteProjectPicker';
import { GuiHostPicker } from '../GuiHostPicker';
import { WorkspacePicker } from '../WorkspacePicker';
import { ConversationWorkspaceStatus } from '../ConversationWorkspaceStatus';
import { ProjectBar } from '../ProjectBar';
import { GuiToolbox } from '../GuiToolbox';
import { ProjectBrowserButton } from '../../../../../web/src/chat/projectBrowser/ProjectBrowserButton';
import workspaceStyles from '../WorkspacePicker.module.less';
import type { GuiComputerNavigation } from './types';

export function RemoteGuiProject({ state, controller, computers, active }: {
  state: ChatState; controller: ChatController; computers: GuiComputerNavigation; active: boolean;
}) {
  const cwd = state.selected?.cwd ?? state.draftProject?.cwd ?? '';
  const canChoose = active && state.ready && !state.selected && !state.sending && !state.workspaceBusy;
  return <div className="gui-remote-project">
    <ProjectBar active={active} scope={`${computers.current?.deviceId}:${state.selected?.id}:${cwd}`}
      trailing={<GuiHostPicker navigation={computers} active={active} />}>
      <RemoteProjectPicker key={`${computers.current?.deviceId}:${state.selected?.id ?? 'draft'}`}
        state={state} controller={controller} active={active} />
      {state.selected && <ConversationWorkspaceStatus key={`${computers.current?.deviceId}:${cwd}`} cwd={cwd}
        enabled={active && state.ready && !state.workspaceBusy} request={controller.guiTools.workspace} />}
      {!state.selected && <WorkspacePicker key={cwd} cwd={cwd} disabled={!canChoose}
        remote localLabel={uiText("client.conversation.worktree")} enabled={active && state.ready}
        request={controller.guiTools.workspace} onBusyChange={controller.setWorkspaceBusy}
        onChange={path => controller.chooseDraftProject(directoryProject(path))} />}
      <GuiToolbox trigger="git" active={active} connected={state.ready && !state.workspaceBusy} cwd={cwd}
        git={controller.guiTools.git} />
      <ProjectBrowserButton client={controller.guiTools.projectBrowser} cwd={cwd}
        active={active} connected={state.ready && !state.workspaceBusy}
        className={workspaceStyles.trigger} desktopStyle />
    </ProjectBar>
  </div>;
}
