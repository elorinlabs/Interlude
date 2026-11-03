import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Popover } from 'antd';
import { File, Folder, X } from 'lucide-react';
import type { MessageTranslator } from '../localization/messages';
import { AttachmentDetails, type AttachmentDetailsFile } from './AttachmentDetails';

export function ComposerAttachment({ file, t, disabled, active = true, onRemove, progress }: {
  file: AttachmentDetailsFile; t: MessageTranslator; disabled: boolean; active?: boolean;
  onRemove: () => void; progress?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  const dismiss = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
  };
  return <span className="cs-composer-attachment">
    <Popover trigger="click" placement="top" arrow={false} fresh open={open && active} onOpenChange={setOpen}
      styles={{ root: { maxWidth: 400 }, body: { padding: 0, borderRadius: 12 } }}
      content={<div className="cs-attachment-popover" onKeyDown={dismiss}>
        {open && active && <AttachmentDetails file={file} t={t} />}</div>}>
      <button type="button" className="cs-attachment-trigger" aria-expanded={open && active}
        aria-label={t('client.chat.attachments.viewFile', { name: file.name })} onKeyDown={dismiss}>
        {file.kind === 'folder' ? <Folder size={15} aria-hidden /> : <File size={15} aria-hidden />}
        <span>{file.name}</span></button>
    </Popover>
    {progress}
    <button type="button" className="cs-attachment-remove" disabled={disabled}
      aria-label={t('client.composer.removeAttachment', { value1: file.name })} onClick={onRemove}>
      <X size={13} aria-hidden /></button>
  </span>;
}
