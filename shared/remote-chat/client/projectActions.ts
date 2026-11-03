import { PROJECT_PIN_OPERATION, PROJECT_REMOVE_OPERATION } from '../projects';
import type { SidebarSnapshot } from '../sidebar';
import type { ChatState } from './types';

export type ProjectAction = 'pin' | 'unpin' | 'remove';
type ProjectMutation = { operation: typeof PROJECT_PIN_OPERATION; cwd: string; pinned: boolean }
  | { operation: typeof PROJECT_REMOVE_OPERATION; cwd: string };

export function projectActionReason(state: ChatState): string {
  if (!state.ready) return 'client.errors.connectToYourComputerFirst';
  if (state.projectActionBusy || state.workspaceBusy || state.sending || state.threadActionBusy) {
    return 'client.threadActions.waitForTheCurrentActionToFinish';
  }
  return '';
}

interface Context {
  generation: () => number;
  snapshot: () => ChatState;
  update: (patch: Partial<ChatState>) => void;
  request: (body: ProjectMutation) => Promise<SidebarSnapshot>;
  complete: (sidebar: SidebarSnapshot) => void;
}

/** Project changes are persisted on the host and shared with every connected sidebar. */
export class ProjectActions {
  constructor(private readonly context: Context) {}

  async run(cwd: string, action: ProjectAction) {
    const reason = projectActionReason(this.context.snapshot());
    if (reason) throw new Error(reason);
    const generation = this.context.generation();
    this.context.update({ projectActionBusy: cwd });
    try {
      const sidebar = await this.context.request(action === 'remove'
        ? { operation: PROJECT_REMOVE_OPERATION, cwd }
        : { operation: PROJECT_PIN_OPERATION, cwd, pinned: action === 'pin' });
      if (generation !== this.context.generation() || !this.context.snapshot().ready) {
        throw new Error('client.errors.connectToYourComputerFirst');
      }
      this.context.complete(sidebar);
      if (action === 'remove' && this.context.snapshot().draftProject?.cwd === cwd) {
        this.context.update({ draftProject: null });
      }
    } finally { this.context.update({ projectActionBusy: undefined }); }
  }
}
