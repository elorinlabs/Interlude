import type { SshApi } from '../../../../shared/terminal/ssh';
import type { ProjectFileTarget } from '../../../../shared/project-browser/protocol';
import { downloadManager } from './manager';

export async function enqueueSshDownload(api: SshApi, sessionId: string, file: ProjectFileTarget) {
  const connection = downloadManager.connectionForSsh(api);
  if (!connection?.ready) throw new Error('client.ssh.closed');
  await downloadManager.enqueue({ owner: connection.owner, deviceId: connection.deviceId,
    deviceName: connection.deviceName, scope: 'computer', path: file.path, sshSessionId: sessionId });
  return 'client.downloads.addedToDownloads';
}
