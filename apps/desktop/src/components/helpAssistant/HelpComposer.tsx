import { useRef, type RefObject } from 'react';
import { ArrowUp, ImagePlus, Square, X } from 'lucide-react';
import { IMAGE_TYPES } from '../../pages/codexGui/draftImages';
import type { HelpCopy } from './copy';
import { MAX_QUESTION_LENGTH } from './types';
import { MAX_HELP_IMAGES, type useHelpImages } from './useHelpImages';
import styles from './helpAssistant.module.less';

interface HelpComposerProps {
  copy: HelpCopy;
  input: RefObject<HTMLTextAreaElement>;
  draft: string;
  setDraft: (value: string) => void;
  disabled: boolean;
  attachments: ReturnType<typeof useHelpImages>;
  send: () => Promise<void>;
  pending: boolean;
  stop: () => Promise<void>;
}

export function HelpComposer({ copy, input, draft, setDraft, disabled, attachments, send, pending, stop }: HelpComposerProps) {
  const picker = useRef<HTMLInputElement>(null);
  const expanded = Boolean(draft.length || attachments.images.length || attachments.reading);
  const canSend = !disabled && !attachments.reading && Boolean(draft.trim() || attachments.images.length);
  return <form className={styles.composer} onSubmit={(event) => {
    event.preventDefault(); if (canSend) void send();
  }}>
    <div className={`${styles.inputBox} ${expanded ? styles.expanded : ''}`}>
      {Boolean(attachments.images.length) && <div className={styles.attachments}>
        {attachments.images.map((url, index) => <div className={styles.attachment} key={index}>
          <img src={url} alt={`${copy.image} ${index + 1}`} />
          <button type="button" aria-label={`${copy.removeImage} ${index + 1}`}
            disabled={disabled || attachments.reading} onClick={() => attachments.remove(index)}>
            <X size={12} /></button>
        </div>)}
      </div>}
      <textarea ref={input} value={draft} onChange={(event) => setDraft(event.target.value)}
        rows={expanded ? 3 : 1} maxLength={MAX_QUESTION_LENGTH} placeholder={copy.placeholder}
        aria-label={copy.placeholder} disabled={disabled} onPaste={(event) => {
          const files = Array.from(event.clipboardData.files);
          if (!files.length || disabled || attachments.reading) return;
          event.preventDefault(); void attachments.add(files);
        }} onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
          event.preventDefault(); if (canSend) void send();
        }} />
      <input ref={picker} type="file" hidden multiple accept={IMAGE_TYPES.join(',')} aria-label={copy.addImage}
        disabled={disabled || attachments.reading} onChange={(event) => {
          void attachments.add(Array.from(event.target.files ?? [])); event.target.value = '';
        }} />
      <button type="button" className={styles.addImage} aria-label={copy.addImage}
        disabled={disabled || attachments.reading || attachments.images.length >= MAX_HELP_IMAGES}
        onClick={() => picker.current?.click()}><ImagePlus size={18} /></button>
      {pending ? <button type="button" className={styles.send} aria-label={copy.stop} onClick={() => void stop()}>
        <Square size={16} /></button> : <button type="submit" className={styles.send} aria-label={copy.send}
          disabled={!canSend}><ArrowUp size={19} /></button>}
    </div>
    {attachments.reading && <p className={styles.imageNotice} role="status">{copy.readingImages}</p>}
    {attachments.error && <p className={styles.imageNotice} role="alert">{copy.imageErrors[attachments.error]}</p>}
  </form>;
}
