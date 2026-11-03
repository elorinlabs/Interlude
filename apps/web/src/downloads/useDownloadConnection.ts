import { useEffect } from 'react';
import type { ChatController } from '../chat/types';
import type { AuthSession } from '../types';
import { downloadManager, downloadOwner } from './manager';

export function useDownloadConnection(options: {
  session: AuthSession; deviceId: string; deviceName: string; enabled?: boolean;
  controller: Pick<ChatController, 'snapshot' | 'subscribe' | 'downloads' | 'files' | 'guiTools'>;
}) {
  const { session, deviceId, deviceName, controller, enabled = true } = options;
  useEffect(() => {
    if (!deviceId || !enabled) return;
    void downloadManager.initialize();
    const update = () => {
      const state = controller.snapshot();
      downloadManager.bind({ owner: downloadOwner(session), deviceId, deviceName, ready: state.ready, mode: state.mode,
        threadId: state.selected?.id, cwd: state.selected?.cwd ?? state.draftProject?.cwd,
        client: controller.downloads, files: controller.files, git: controller.guiTools.git,
        projectBrowser: controller.guiTools.projectBrowser, ssh: controller.guiTools.terminal.ssh });
    };
    update();
    const unsubscribe = controller.subscribe(update);
    return () => { unsubscribe(); downloadManager.unbind(controller.files); };
  }, [session.baseUrl, session.email, deviceId, deviceName, controller, enabled]);
}
