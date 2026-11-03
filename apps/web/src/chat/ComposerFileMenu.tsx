import { displayError } from '../i18n/index';
import type { RefObject } from 'react';
import { File, Folder, X } from 'lucide-react';
import { t, useLanguage } from '../i18n';
import { projectFileReference, useProjectFileCandidates,
  type ProjectFileSearch } from '../../../../shared/chat/useProjectFileCandidates';
import type { AttachmentReference } from '../../../desktop/src/pages/codexGui/attachmentTypes';
import { useComposerMenuKeyboard } from './useComposerMenuKeyboard';
import './composerFileMenu.css';

export function ComposerFileMenu(props: {
  input: RefObject<HTMLTextAreaElement>; query: string; threadId: string | null; cwd: string; ready: boolean;
  load: ProjectFileSearch; choose: (reference: AttachmentReference) => void; close: () => void;
}) {
  useLanguage();
  const { input, query, threadId, cwd, ready, load, choose, close } = props;
  const result = useProjectFileCandidates({ active: true, connected: ready, query, threadId, cwd, load });
  const keyboard = useComposerMenuKeyboard({ input, query, close, selectWithTab: true,
    options: result.entries.map(file => ({ key: file.path, enabled: ready,
      choose: () => choose(projectFileReference(file)) })) });
  return <div className="chat-command-menu chat-file-menu" aria-label={t("client.fileReferences.referenceAFileOrFolder")}>
    <header><strong>{t("client.fileReferences.referenceAFileOrFolder")}</strong>
      <button type="button" aria-label={t("client.fileReferences.closeFileList")} onClick={close}><X size={16} /></button></header>
    <div ref={keyboard.list} id={keyboard.id} className="chat-menu-options" role="menu" aria-label={t("client.projectBrowser.projectFiles")}>
      {result.entries.map(file => <button key={file.path} type="button" role="menuitem" disabled={!ready}
        {...keyboard.optionProps(file.path)} onPointerDown={event => event.preventDefault()}
        onClick={() => choose(projectFileReference(file))}>
        {file.directory ? <Folder size={18} /> : <File size={18} />}
        <span><strong>{file.name}</strong><small>{file.relativePath ?? file.path}</small></span>
      </button>)}
      {result.loading && <p role="status">{t("client.fileReferences.searchingFiles")}</p>}
      {result.error && <p role="status">{displayError(result.error)}</p>}
      {!result.loading && !result.error && !result.entries.length && <p>{t("client.fileReferences.noMatchingFilesOrFolders")}</p>}
      {result.truncated && <p role="status">{t("client.fileReferences.showingPartialResultsEnterAMoreSpecificNameOrPath")}</p>}
    </div>
  </div>;
}
