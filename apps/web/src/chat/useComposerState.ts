import { displayError } from '../i18n/index';
import { modelSelectionError } from '../../../desktop/src/pages/codexGui/modelSelection';
import { t } from '../i18n';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useChatDraft } from '../../../../shared/remote-chat/client/useChatDraft';
import { useQueueEditor } from '../../../../shared/remote-chat/client/useQueueEditor';
import { useGoalMode } from '../../../../shared/remote-chat/client/useGoalMode';
import { composerAction, CONTINUE_MESSAGE } from '../../../../shared/remote-chat/composerAction';
import { chatAttachmentDataLimit, validateUploadedFiles } from '../../../../shared/remote-chat/composerAttachments';
import { replyWithQuotes } from '../../../../shared/chat/replyQuotes';
import { useChatQuotes } from './ChatQuotes';
import { useComposerAttachments } from './useComposerAttachments';
import { useComposerMenu } from './useComposerMenu';
import type { ComposerProps } from './composerProps';
import { pickChatImages } from './pickChatImages';
import { useComposerPaste } from './useComposerPaste';
import { fileDropError, useFileDrop } from '../../../../shared/chat/useFileDrop';
import { useComposerFileReferences } from '../../../../shared/chat/ChatFileReferences';

export function useComposerState(props: ComposerProps) {
  const { threadId, active, ready, sending, settingsBusy, compacting, selection, send, goals, running } = props;
  const goalMode = useGoalMode(threadId, sending);
  const [pausing, setPausing] = useState(false);
  const [dictationBusy, setDictationBusy] = useState(false);
  const [error, setError] = useState('');
  const attachments = useComposerAttachments({ threadId, sending });
  const dropTarget = useRef<HTMLDivElement>(null);
  const quotes = useChatQuotes();
  const disabled = !ready || settingsBusy || compacting;
  const draft = useChatDraft({ threadId, sending, disabled: disabled || attachments.busy || dictationBusy, selection, send,
    recovered: props.recoveredEdit, consumeRecovered: props.consumeRecoveredEdit });
  const menu = useComposerMenu({ draft, scope: `${threadId ?? ''}:${props.cwd}`, active,
    refresh: props.catalog.refresh, compact: props.compact });
  const hasContent = draft.hasContent || attachments.items.length > 0 || Boolean(quotes?.quotes.length);
  const queueEditor = useQueueEditor({ threadId, queue: props.queue,
    disabled: !active || disabled || sending || draft.picking || attachments.busy || dictationBusy || hasContent,
    restore: message => {
      draft.restore({ ...message, attachments: [] }); attachments.restore(message.attachments ?? []);
      menu.setSelection({ start: message.text.length, end: message.text.length });
      requestAnimationFrame(() => menu.input.current?.focus());
    } });
  const addFiles = async (files: File[]) => {
    const images = files.filter(file => file.type.startsWith('image/'));
    const documents = files.filter(file => !file.type.startsWith('image/'));
    await Promise.all([
      images.length ? draft.addImages(remaining => pickChatImages(images, remaining)) : undefined,
      documents.length ? attachments.pick(documents) : undefined,
    ]);
  };
  const drop = useFileDrop({ target: dropTarget, scope: threadId, active,
    disabled: disabled || sending || draft.picking || attachments.busy || queueEditor.loading,
    subscribe: props.nativeFileDrop?.subscribe,
    addPaths: async (paths, current) => {
      const files = await props.nativeFileDrop!.readFiles(paths);
      if (!current()) return;
      await addFiles(files);
      if (current()) menu.input.current?.focus();
    }, addFiles, report: error => setError(displayError(fileDropError(error))) });
  const paste = useComposerPaste({ scope: threadId, active,
    busy: sending || draft.picking || attachments.busy || queueEditor.loading || drop.reading,
    readClipboardImages: props.readClipboardImages, insertText: (text, input) => {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const available = Math.max(0, input.maxLength - input.value.length + end - start);
      const inserted = input.maxLength < 0 ? text : text.slice(0, available);
      draft.setText(input.value.slice(0, start) + inserted + input.value.slice(end));
      menu.restoreCaret(start + inserted.length);
    }, addFiles });
  const busy = sending || draft.picking || attachments.busy || queueEditor.loading || paste.reading || drop.reading;
  useComposerFileReferences({ scope: `${threadId ?? ''}:${props.cwd}`,
    enabled: active && !disabled && !busy && !goalMode.enabled, add: attachments.add,
    addQuote: quote => quotes?.add({ ...quote, role: 'tool' }) ?? false,
    focus: () => menu.input.current?.focus() });
  const compact = !goalMode.enabled && !props.goal && !draft.text.length && !hasContent && !busy;
  const action = composerAction({ running: running && !hasContent,
    interrupted: !!props.interrupted && !goalMode.enabled, hasDraft: hasContent });
  const actionDisabled = dictationBusy || (action === 'pause' ? !ready || pausing : disabled || busy || props.goalBusy
    || Boolean(modelSelectionError(props.models, selection))
    || (goalMode.enabled && running) || (action === 'send' && !hasContent));
  useEffect(() => { if (active && ready && threadId) void goals.load(threadId); }, [goals, threadId, active, ready]);
  useEffect(() => { setError(''); }, [threadId]);
  useLayoutEffect(() => {
    const input = menu.input.current;
    if (!input || !active) return;
    const resize = () => {
      const viewport = input.closest<HTMLElement>('.chat-composer-content');
      const scrollTop = viewport?.scrollTop ?? 0;
      const editingEnd = document.activeElement === input && input.selectionStart === input.value.length;
      // Measuring at auto height temporarily collapses the outer scroll range.
      // Restore it after sizing, keeping the last line's padding visible while typing at the end.
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
      input.scrollTop = 0;
      if (viewport) viewport.scrollTop = editingEnd ? viewport.scrollHeight : scrollTop;
    };
    resize();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      resize();
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [draft.text, active, menu.input]);
  const previousQuoteCount = useRef(0);
  const quoteCount = quotes?.quotes.length ?? 0;
  useEffect(() => {
    const added = quoteCount > previousQuoteCount.current;
    previousQuoteCount.current = quoteCount;
    if (!added || !active) return;
    const frame = requestAnimationFrame(() => menu.input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [quoteCount, active, menu.input]);
  const submit = async () => {
    if (actionDisabled) return;
    if (action === 'pause') {
      setPausing(true);
      try { await props.interrupt(); } finally { setPausing(false); }
      return;
    }
    const submitted = attachments.items;
    const submittedQuotes = quotes?.quotes ?? [];
    try {
      validateUploadedFiles(submitted);
      const size = draft.images.reduce((total, image) => total + image.url.length, 0)
        + submitted.reduce((total, item) => total + (item.data?.length ?? 0), 0);
      if (size > chatAttachmentDataLimit()) throw new Error(t("client.chat.attachmentsAreTooLargeRemoveSomePhotosOrFilesAnd"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("client.chat.couldNotSendTheFilePleaseChooseItAgain")); return; }
    setError('');
    const text = replyWithQuotes(action === 'continue' ? CONTINUE_MESSAGE : draft.text, submittedQuotes);
    if (await draft.submit({ text, attachments: submitted, goalMode: goalMode.enabled })) {
      goalMode.exit(); attachments.clearSubmitted(submitted); quotes?.clear(submittedQuotes);
    }
  };
  const removeGoal = () => {
    if (props.goal && threadId) void goals.clear(threadId).then(cleared => { if (cleared) goalMode.exit(); });
    else goalMode.exit();
  };
  return { draft, attachments, goalMode, menu, queueEditor, busy, compact, action, actionDisabled, pausing,
    drop, dropTarget, dictationBusy, setDictationBusy,
    hasQuotes: Boolean(quotes?.quotes.length),
    error: error || paste.error || attachments.error || draft.error, submit, removeGoal,
    paste: paste.paste, pasteKeyDown: paste.pasteKeyDown, readingClipboard: paste.reading };
}
