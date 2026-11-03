import { displayError } from '../i18n/index';
import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import type { AttachmentReference, ComposerPlugin } from '../../../desktop/src/pages/codexGui/attachmentTypes';
import { remoteAttachments } from '../../../../shared/remote-chat/composerAttachments';
import { checkFileUploadSize } from '../../../../shared/remote-chat/policy';
import { readFileBase64 } from '../../../../shared/chat/fileData';

/** Validation copy may already be localized when thrown, so trust it by origin rather than by wording. */
export class AttachmentRejection extends Error {}

function rejection(cause: unknown) {
  return cause instanceof Error ? new AttachmentRejection(cause.message) : cause;
}

function validated<T>(step: () => T): T {
  try { return step(); } catch (cause) { throw rejection(cause); }
}

export function attachmentErrorMessage(cause: unknown) {
  return cause instanceof AttachmentRejection ? displayError(cause.message) : t("client.chat.couldNotAddTheFilePleaseChooseItAgain");
}

export function useComposerAttachments({ threadId, sending }: { threadId: string | null; sending: boolean }) {
  const [items, setItems] = useState<AttachmentReference[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const picking = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const scope = useRef(threadId);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  useEffect(() => {
    if (scope.current === threadId) return;
    const creating = scope.current === null && sending;
    scope.current = threadId;
    if (creating) return;
    generation.current += 1; setItems([]); setError('');
  }, [threadId, sending]);
  const pick = async (files: File[]) => {
    if (picking.current || sending || !files.length) return;
    const current = generation.current;
    picking.current = true; setBusy(true); setError('');
    try {
      const additions: AttachmentReference[] = [];
      for (const file of files) {
        if (current !== generation.current) return;
        validated(() => checkFileUploadSize(file.size));
        const data = await readFileBase64(file).catch((cause: unknown) => { throw rejection(cause); });
        additions.push({ kind: 'file', name: file.name, path: '', data });
        validated(() => remoteAttachments([...items, ...additions]));
      }
      if (current === generation.current) setItems(existing => [...existing, ...additions]);
    } catch (cause) {
      if (current === generation.current) setError(attachmentErrorMessage(cause));
    } finally { picking.current = false; if (mounted.current) setBusy(false); }
  };
  const add = (item: AttachmentReference) => {
    if (sending || picking.current) return false;
    try {
      setItems(remoteAttachments([...items.filter(entry => entry.path !== item.path), item])); setError('');
      return true;
    } catch { setError(t("client.chat.eachMessageCanHaveUpTo8AttachmentsOrConversation")); return false; }
  };
  return { items, busy, error, pick, add,
    addPlugin: (plugin: ComposerPlugin) => add({ kind: 'plugin', name: plugin.interface?.displayName || plugin.name,
      path: `plugin://${plugin.id}` }),
    restore: setItems, remove: (item: AttachmentReference) => setItems(current => current.filter(entry => entry !== item)),
    clearSubmitted: (submitted: AttachmentReference[]) =>
      setItems(current => current.filter(entry => !submitted.includes(entry))) };
}
