import { useRef, useState, type SetStateAction } from 'react';
import type { LoungeDraft } from './types';

export interface ComposerDraftState { draft: LoungeDraft; change: (draft: LoungeDraft) => void }

/** Keep asynchronous image preparation and sends scoped to the composer that started them. */
export function useComposerDraft(external?: ComposerDraftState) {
  const [local, setLocal] = useState<LoungeDraft>({ text: '', images: [] });
  const draft = external?.draft ?? local;
  const latest = useRef(draft);
  latest.current = draft;
  const change = (next: LoungeDraft) => {
    latest.current = next;
    if (external) external.change(next);
    else setLocal(next);
  };
  const setText = (value: SetStateAction<string>) => change({ ...latest.current,
    text: typeof value === 'function' ? value(latest.current.text) : value });
  const setImages = (value: SetStateAction<string[]>) => change({ ...latest.current,
    images: typeof value === 'function' ? value(latest.current.images) : value });
  const clearSent = (sent: LoungeDraft) => {
    const current = latest.current;
    // The input stays editable during delivery; retain anything changed after Send was pressed.
    change({ text: current.text === sent.text ? '' : current.text,
      images: current.images === sent.images ? [] : current.images,
      reply: current.reply === sent.reply ? undefined : current.reply });
  };
  return { text: draft.text, images: draft.images, setText, setImages, clearSent };
}
