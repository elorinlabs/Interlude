import { createContext, useCallback, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { AttachmentReference } from '../../apps/desktop/src/pages/codexGui/attachmentTypes';
import type { ProjectFile } from '../remote-chat/projectFiles';
import { projectFileReference } from './useProjectFileCandidates';
import { fileSelectionQuote, type FileSelection } from '../project-browser/fileSelection';
import { MAX_QUOTE_CHARACTERS, type ReplyQuote } from '../../apps/desktop/src/pages/codexGui/replyQuotes';

interface ReferenceTarget {
  scope: string;
  add: (reference: AttachmentReference) => boolean;
  addQuote?: (quote: ReplyQuote) => boolean;
  focus: () => void;
}
const Context = createContext<{ current: ReferenceTarget | null } | null>(null);
const UNAVAILABLE = '暂时无法引用，请确认聊天可用且附件数量未达上限。';

/** Each conversation workspace owns its receiver, including retained remote workspaces. */
export function ChatFileReferencesProvider({ children, enabled = true }: {
  children: ReactNode; enabled?: boolean;
}) {
  const target = useRef<ReferenceTarget | null>(null);
  return <Context.Provider value={enabled ? target : null}>{children}</Context.Provider>;
}

export function useComposerFileReferences(options: ReferenceTarget & { enabled: boolean }) {
  const target = useContext(Context);
  useLayoutEffect(() => {
    if (!target || !options.enabled) return;
    target.current = options;
    return () => { if (target.current === options) target.current = null; };
  }, [target, options.scope, options.enabled, options.add, options.addQuote, options.focus]);
}

export function useChatFileSelection() {
  const target = useContext(Context);
  return useCallback((selection: FileSelection) => {
    const receiver = target?.current;
    const quote = fileSelectionQuote(selection);
    if (quote.text.length > MAX_QUOTE_CHARACTERS) throw new Error('这段内容太长，请缩小引用范围。');
    if (!receiver?.addQuote?.(quote)) throw new Error('暂时无法引用，请确认聊天可用且引用数量未达上限。');
    return () => {
      if (target?.current?.scope === receiver.scope) target.current.focus();
    };
  }, [target]);
}

/** Add synchronously; focus only after the caller has hidden its drawer or modal. */
export function useChatFileReference() {
  const target = useContext(Context);
  return useCallback((entry: ProjectFile) => {
    const receiver = target?.current;
    if (!receiver || !receiver.add(projectFileReference(entry))) throw new Error(UNAVAILABLE);
    return () => {
      if (target.current?.scope === receiver.scope) target.current.focus();
    };
  }, [target]);
}
