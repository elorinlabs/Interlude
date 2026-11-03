import { useEffect, useRef, useState } from 'react';
import { ChatImageError, MAX_CHAT_IMAGES, validateChatImages, type DraftImage } from '../attachments';
import type { SendInput } from './types';
import type { AttachmentReference } from '../../../apps/desktop/src/pages/codexGui/attachmentTypes';
import type { ComposerSettings } from '../composer';
import type { Skill } from './types';
import { draftSkills, editSkillDraft, emptySkillDraft, insertDraftSkill, type TextSelection } from './skillDraft';
import { queuedMessageText } from '../../../apps/desktop/src/pages/codexGui/queuedMessageDraft';
import { draftImage } from '../attachments';
import type { QueueDraft } from '../queue';
import { getInterfaceLanguage } from "../../localization/interfaceLanguage";
import { translateMessage } from "../../localization/messages";

interface Options {
  threadId: string | null;
  sending: boolean;
  disabled: boolean;
  selection: ComposerSettings;
  send: (input: SendInput) => Promise<boolean>;
  recovered?: QueueDraft;
  consumeRecovered?: () => void;
}

export function useChatDraft({ threadId, sending, disabled, selection, send, recovered, consumeRecovered }: Options) {
  const [content, setContent] = useState(emptySkillDraft);
  const { text } = content;
  const setText = (value: string) => setContent((draft) => editSkillDraft(draft, value));
  const appendDictation = (value: string) => {
    if (!value.trim()) return;
    setContent(draft => ({ ...draft,
      text: draft.text + (draft.text && !/\s$/.test(draft.text) ? '\n' : '') + value.trim() }));
  };
  const insertSkill = (range: TextSelection, skill: Skill) =>
    setContent((draft) => insertDraftSkill(draft, range, skill));
  const removeText = (range: TextSelection, expected: string) => setContent((draft) => draft.text === expected
    ? editSkillDraft(draft, expected.slice(0, range.start) + expected.slice(range.end)) : draft);
  const [images, setImages] = useState<DraftImage[]>([]);
  const [references, setReferences] = useState<AttachmentReference[]>([]);
  const restore = (message: QueueDraft) => {
    setContent(queuedMessageText(message)); setImages(message.images.map(draftImage));
    setReferences(message.attachments ?? []); setError('');
  };
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const scope = useRef(threadId);
  const generation = useRef(0);
  const busy = useRef(false);
  const submitting = useRef(false);
  const recoveredEdits = useRef(new WeakSet<QueueDraft>());
  useEffect(() => () => { generation.current += 1; }, []);
  useEffect(() => {
    if (scope.current === threadId) return;
    // Creating a thread during the first send must not discard a failed draft.
    const creating = scope.current === null && submitting.current;
    scope.current = threadId;
    if (creating) return;
    generation.current += 1;
    busy.current = false;
    submitting.current = false;
    setText(''); setImages([]); setReferences([]); setError(''); setPicking(false);
  }, [threadId]);

  useEffect(() => {
    if (!recovered || sending || recoveredEdits.current.has(recovered)) return;
    recoveredEdits.current.add(recovered);
    consumeRecovered?.();
    setContent(previous => queuedMessageText({ ...recovered,
      text: [previous.text, recovered.text].filter(Boolean).join('\n\n'),
      skills: [...draftSkills(previous), ...recovered.skills] }));
    setImages(previous => [...previous, ...recovered.images.map(draftImage)]);
    setReferences(previous => [...previous, ...(recovered.attachments ?? [])]);
  }, [recovered, consumeRecovered, sending]);

  const addImages = async (pick: (remaining: number) => Promise<DraftImage[]>) => {
    if (busy.current || submitting.current || sending) return;
    const current = generation.current;
    busy.current = true; setPicking(true); setError('');
    try {
      if (images.length >= MAX_CHAT_IMAGES) {
        throw new ChatImageError(translateMessage(getInterfaceLanguage(), "client.chat.youCanAddUpToImagesAtATime",
          { value1: MAX_CHAT_IMAGES }));
      }
      const selected = await pick(MAX_CHAT_IMAGES - images.length);
      if (current !== generation.current || !selected.length) return;
      validateChatImages([...images, ...selected].map((image) => image.url));
      setImages((existing) => [...existing, ...selected]);
    } catch (cause) {
      if (current === generation.current) {
        setError(cause instanceof ChatImageError ? cause.message : '暂时无法添加图片，请重新选择。');
      }
    } finally {
      if (current === generation.current) { busy.current = false; setPicking(false); }
    }
  };
  const submit = async (override: {
    text?: string; images?: string[]; attachments?: AttachmentReference[]; goalMode?: boolean;
  } = {}) => {
    const submittedText = override.text ?? text;
    const submittedImages = override.images ?? images.map((image) => image.url);
    const submittedReferences = override.attachments ?? references;
    if (disabled || sending || busy.current || submitting.current
      || (!submittedText.trim() && !submittedImages.length && !submittedReferences.length)) return false;
    const current = generation.current;
    submitting.current = true; setError('');
    try {
      const skills = draftSkills(content);
      const sent = await send({ text: submittedText, images: submittedImages, ...selection,
        ...(override.goalMode ? { goalMode: true } : {}),
        ...(submittedReferences.length ? { attachments: submittedReferences } : {}),
        ...(skills.length ? { skills } : {}) });
      if (!sent || current !== generation.current) return false;
      setContent((value) => value.text === text ? emptySkillDraft() : value);
      setImages((value) => value.filter((image) => !images.includes(image)));
      setReferences((value) => value.filter((item) => !submittedReferences.includes(item)));
      return true;
    } catch {
      if (current === generation.current) setError('消息未发送，请稍后重试。');
      return false;
    } finally {
      if (current === generation.current) submitting.current = false;
    }
  };
  const removeImage = (id: string) => {
    if (sending || busy.current || submitting.current) return;
    setImages((value) => value.filter((image) => image.id !== id)); setError('');
  };
  const replaceImage = (original: DraftImage, url: string) => {
    if (sending || busy.current || submitting.current || !images.includes(original)) {
      throw new ChatImageError('图片已变更，请重新打开后编辑。');
    }
    validateChatImages(images.map((image) => image === original ? url : image.url));
    setImages((current) => current.map((image) => image === original ? { ...image, url } : image));
    setError('');
  };
  return { text, setText, appendDictation, insertSkill, removeText, images, error, picking,
    addImages, removeImage, replaceImage, submit,
    restore, references, removeReference: (item: AttachmentReference) =>
      setReferences((value) => value.filter((reference) => reference !== item)),
    hasContent: Boolean(text.trim() || images.length || references.length) };
}
