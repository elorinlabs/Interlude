import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Popover } from 'antd';
import { File, Folder, Paperclip } from 'lucide-react';
import type { MessageTranslator } from '../localization/messages';
import type { MessageAttachment } from './messageAttachments';
import './messageAttachments.css';
import { AttachmentDetails } from './AttachmentDetails';

export function MessageAttachments({ attachments, t, renderFile }: {
  attachments: MessageAttachment[]; t: MessageTranslator;
  renderFile?: (attachment: MessageAttachment) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!attachments.length) return null;
  const dismiss = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
  };
  const content = <div className="cs-message-attachment-preview" onKeyDown={dismiss}>
    <div className="cs-message-attachment-heading">{t('client.chat.attachments.details')}</div>
    <ul>{attachments.map((attachment, index) => <li key={attachment.path || index}>
      {attachment.kind === 'folder' ? <Folder size={16} aria-hidden /> : <File size={16} aria-hidden />}
      {open && <AttachmentDetails file={attachment} t={t}
        nameContent={attachment.path && attachment.kind === 'file' && renderFile
          ? renderFile(attachment) : undefined} />}
    </li>)}</ul>
  </div>;
  return <div className="cs-message-attachments">
    <Popover trigger="click" placement="top" arrow={false} fresh content={content}
      open={open} onOpenChange={setOpen}
      styles={{ root: { maxWidth: 400 }, body: { padding: 0, borderRadius: 12 } }}>
      <button type="button" className="cs-message-attachment-button"
        aria-label={t('client.chat.attachments.view', { count: attachments.length })}
        aria-expanded={open} onKeyDown={dismiss}>
        <Paperclip size={15} aria-hidden />{t('client.chat.attachments.count', { count: attachments.length })}
      </button>
    </Popover>
  </div>;
}
