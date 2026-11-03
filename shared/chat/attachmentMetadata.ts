import { createContext } from 'react';
import type { FileAction, FileActionResult, FileMetadata, FileTarget } from '../remote-chat/files';

export type ReadAttachmentMetadata = (path: string) => Promise<FileMetadata>;
export const AttachmentMetadataContext = createContext<ReadAttachmentMetadata | null>(null);

export async function readAttachmentMetadata(options: {
  perform: (target: FileTarget, action: FileAction) => Promise<FileActionResult>;
  path: string; threadId: string | null;
}): Promise<FileMetadata> {
  const result = await options.perform({ path: options.path, threadId: options.threadId }, { type: 'metadata' });
  if (!result.metadata) throw new Error('File metadata unavailable');
  return result.metadata;
}
