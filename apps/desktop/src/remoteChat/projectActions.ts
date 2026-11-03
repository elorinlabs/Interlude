import { getGuiController } from '../pages/codexGui/session';
import { guiSidebar } from '../pages/codexGui/sidebarBridge';
import { PROJECT_PIN_OPERATION } from '../../../../shared/remote-chat/projects';

const MAX_PATH_LENGTH = 4096;

/** Route project mutations through local persistence without switching the host's conversation. */
export async function changeRemoteProject(body: Record<string, unknown>) {
  const { cwd, pinned } = body;
  const pin = body.operation === PROJECT_PIN_OPERATION;
  if (typeof cwd !== 'string' || !cwd.trim() || cwd.length > MAX_PATH_LENGTH || cwd.includes('\0')
    || (pin && typeof pinned !== 'boolean')) {
    throw new Error('client.workspaceActions.chooseAValidProjectFolder');
  }
  const controller = getGuiController();
  const state = controller.getSnapshot();
  if (state.workspaceBusy || state.sending || state.removingProject) {
    throw new Error('client.workspaceActions.theProjectIsBusyPleaseTryAgainShortly');
  }
  if (pin) {
    if (state.pinnedProjects.includes(cwd) !== pinned) controller.projectActions.pin(cwd);
  } else {
    if (state.connection !== 'ready') await controller.connect({ reuseExisting: true });
    if (!await controller.projectActions.remove(cwd)) {
      throw new Error('client.conversation.couldNotRemoveTheProjectPleaseTryAgainYourConversations');
    }
  }
  return guiSidebar.observe([]);
}
