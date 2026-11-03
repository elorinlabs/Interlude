import type { BrowserHost } from '../../../../../shared/project-browser/entryActions';
import type { ProjectBrowserClient } from '../../../../../shared/project-browser/protocol';
import { downloadProjectEntry } from '../../../../../shared/project-browser/downloads';
import { copyText } from '../../../../desktop/src/utils/clipboard';
import { downloadManager } from '../../downloads/manager';
import { browserDownloadTarget } from '../fileDownloadTarget';

export function browserHost(client: ProjectBrowserClient): BrowserHost {
  return {
    copyPath: copyText,
    download: async file => {
      const connection = downloadManager.connectionForProjectBrowser(client);
      if (connection) {
        await downloadManager.enqueue({ ...file, scope: 'project', owner: connection.owner,
          deviceId: connection.deviceId, deviceName: connection.deviceName });
        return '已加入下载列表。';
      }
      if (!client.transfer) throw new Error('暂时无法下载，请重新连接后重试。');
      await downloadProjectEntry({ client: client.transfer, file, transferId: crypto.randomUUID(),
        signal: new AbortController().signal, target: browserDownloadTarget, progress: () => undefined });
      return '下载完成。';
    },
  };
}
