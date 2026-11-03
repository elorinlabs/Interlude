import type { ReactNode } from 'react';
import type { MessageTranslator } from '../localization/messages';
import { useAttachmentDetails, type AttachmentDetailsFile } from './useAttachmentDetails';
import './attachmentDetails.css';

export type { AttachmentDetailsFile } from './useAttachmentDetails';

/** Mounted only in an open popover: inspecting metadata never starts a file download. */
export function AttachmentDetails({ file, t, nameContent }: {
  file: AttachmentDetailsFile; t: MessageTranslator; nameContent?: ReactNode;
}) {
  const { name, path, sizeText, loading, failed, modifiedText } = useAttachmentDetails(file, t);
  return <dl className="cs-attachment-details">
    <dt>{t('client.chat.attachments.name')}</dt><dd>{nameContent ?? name}</dd>
    <dt>{t('client.chat.attachments.path')}</dt>
    <dd>{path}</dd>
    <dt>{t('client.chat.attachments.size')}</dt><dd role={loading || failed ? 'status' : undefined}>{sizeText}</dd>
    {modifiedText && <><dt>{t('client.chat.attachments.modified')}</dt><dd>{modifiedText}</dd></>}
  </dl>;
}
