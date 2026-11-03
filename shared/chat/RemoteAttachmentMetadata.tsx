import { useCallback, type ReactNode } from 'react';
import { AttachmentMetadataContext, readAttachmentMetadata } from './attachmentMetadata';
import type { ChatController } from '../remote-chat/client/controller';

export function ChatAttachmentMetadata({ controller, ready, threadId, children }: {
  controller: ChatController; ready: boolean; threadId: string | null; children: ReactNode;
}) {
  const read = useCallback((path: string) => {
    if (!ready) return Promise.reject(new Error('Remote computer unavailable'));
    return readAttachmentMetadata({ path, threadId, perform: controller.guiTools.files.perform });
  }, [controller, ready, threadId]);
  return <AttachmentMetadataContext.Provider value={read}>{children}</AttachmentMetadataContext.Provider>;
}
