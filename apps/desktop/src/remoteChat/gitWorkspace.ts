import { invoke } from '../api/backend';
import { object } from '../../../../shared/remote-chat/protocol';
import type { GitStatus } from '../../../../shared/remote-chat/gitWorkspace';

export async function workspaceRequest(input: unknown): Promise<GitStatus> {
  const request = object(input);
  if (!['status', 'switch', 'createWorktree'].includes(String(request.operation))) {
    throw new Error('操作无效，请重新选择。');
  }
  // The host coordinates task lifetimes and Git changes per worktree across all connected clients.
  return invoke('codex_gui_git', { request });
}
