import type { GitClient } from '../../../../shared/remote-chat/gitTypes';
import { downloadManager } from './manager';

export async function enqueueGitPatch(client: GitClient, cwd: string, commit: string) {
  const connection = downloadManager.connectionForGit(client);
  if (!connection?.ready) throw new Error('电脑连接后即可创建补丁。');
  await downloadManager.enqueue({ owner: connection.owner, deviceId: connection.deviceId,
    deviceName: connection.deviceName, scope: 'project', cwd, gitCommit: commit,
    path: `${commit.slice(0, 12)}.patch` });
}
