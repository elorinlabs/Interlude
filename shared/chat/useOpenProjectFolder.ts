import { useRef } from 'react';
import { App } from 'antd';
import type { MessageTranslator } from '../localization/messages';
import type { createGuiFilesClient } from '../remote-chat/files';

type FolderClient = Pick<ReturnType<typeof createGuiFilesClient>, 'perform'>;

/** Open the project's contents on the computer that owns it, without selecting a conversation. */
export function useOpenProjectFolder(client: FolderClient, translate: MessageTranslator) {
  const { message } = App.useApp();
  const inFlight = useRef(false);
  return async (cwd: string): Promise<void> => {
    if (!cwd || inFlight.current) return;
    inFlight.current = true;
    try {
      // Explorer/reveal selects the folder in its parent; default opens the folder itself.
      await client.perform({ path: cwd, threadId: null }, { type: 'open', application: 'default' });
    } catch {
      void message.error({ content: translate('client.errorsAccounts.couldNotOpenTheFolderTryAgainLater'),
        style: { maxWidth: 400, marginInline: 'auto' } });
    } finally { inFlight.current = false; }
  };
}
