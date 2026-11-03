import { useContext, useEffect, useState } from 'react';
import type { MessageTranslator } from '../localization/messages';
import type { FileMetadata } from '../remote-chat/files';
import { base64Bytes } from '../remote-chat/policy';
import { AttachmentMetadataContext } from './attachmentMetadata';
import { getInterfaceLanguage } from '../localization/interfaceLanguage';
import { localeForLanguage } from '../localization/language';

export interface AttachmentDetailsFile { name: string; path: string; kind: 'file' | 'folder'; data?: string }

/** Call only while details are open; metadata never starts a file download. */
export function useAttachmentDetails(file: AttachmentDetailsFile, t: MessageTranslator) {
  const read = useContext(AttachmentMetadataContext);
  const [result, setResult] = useState<FileMetadata>();
  const [failed, setFailed] = useState(false);
  const uploaded = file.data !== undefined;
  const locale = localeForLanguage(getInterfaceLanguage());
  useEffect(() => {
    setResult(undefined); setFailed(false);
    if (uploaded || !file.path || !read) return;
    let cancelled = false;
    void read(file.path).then(value => { if (!cancelled) setResult(value); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [file.path, uploaded, read]);
  const size = uploaded ? base64Bytes(file.data!) : result?.size;
  const loading = !uploaded && Boolean(read && file.path) && !result && !failed;
  const sizeText = file.kind === 'folder' ? t('client.chat.attachments.folderSize')
    : size != null ? t('client.chat.attachments.bytes', { size: size.toLocaleString(locale) })
      : t(loading ? 'client.chat.attachments.loading' : 'client.chat.attachments.unavailable');
  return { name: result?.name || file.name,
    path: result?.path || file.path || t('client.chat.attachments.pathPending'), sizeText, loading, failed,
    modifiedText: result?.modifiedAt == null ? undefined : new Date(result.modifiedAt).toLocaleString(locale) };
}
