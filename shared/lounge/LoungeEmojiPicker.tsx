import { useEffect, useId, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { displayText as t } from '../localization/messages';
import { LOUNGE_EMOJI } from './emoji';

/** A native button owns the toggle; opening never depends on focus or a cloned popup trigger. */
export function LoungeEmojiPicker({ disabled, insert, onOpenChange }: {
  disabled: boolean; insert: (emoji: string) => void; onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return <div className="lounge-emoji-control" ref={root}>
    <button ref={trigger} type="button" disabled={disabled} aria-label={t('client.lounge.emoji')}
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      <Smile size={22} /></button>
    {open && <div id={id} className="lounge-emoji-panel" role="group" aria-label={t('client.lounge.emoji')}>
      <div className="lounge-emoji-picker">{LOUNGE_EMOJI.map(emoji => <button key={emoji} type="button"
        onClick={() => { setOpen(false); insert(emoji); }}>{emoji}</button>)}</div>
    </div>}
  </div>;
}
