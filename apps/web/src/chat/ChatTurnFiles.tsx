import { useContext } from 'react';
import { FileText } from 'lucide-react';
import { DetailsContext } from '../../../desktop/src/pages/codexGui/detailsContext';
import type { DiffFile } from '../../../../shared/chat/diff';
import { t } from '../i18n';
import { ChatFilesSummary } from './ChatFilesSummary';
import { ChatChangesPill } from './ChatChangesPill';

const PREVIEW_FILES = 3;

export function ChatTurnFiles({ files, running, onOpen, onResult }: {
  files: DiffFile[]; running: boolean; onOpen: () => void; onResult?: () => void;
}) {
  const details = useContext(DetailsContext);
  const result = onResult && <button type="button" className="chat-task-result" onClick={onResult}>
    {t("client.taskReview.reviewResult")}</button>;
  if (details) return <ChatFilesSummary files={files} compact={running} beforeReview={result} />;
  if (running) return <ChatChangesPill files={files} onOpen={onOpen} />;
  const paths = [...new Set(files.map(file => file.path))];
  return <div className="chat-files-summary">
    <div className="chat-files-header">
      <button type="button" className="chat-files-overview"
        aria-label={t("client.chat.viewChangesFiles", { value1: paths.length })} onClick={onOpen}>
        <FileText size={21} /><span><strong>{t("client.downloads.editedFiles", { count: paths.length })}</strong>
          <span className="chat-files-counts">
            <b className="chat-added">+{files.reduce((sum, file) => sum + file.added, 0)}</b>
            <b className="chat-removed">−{files.reduce((sum, file) => sum + file.removed, 0)}</b>
          </span></span>
      </button>
      <div className="chat-files-actions">{result}
        <button type="button" onClick={onOpen}>{t("client.chat.review")}</button></div>
    </div>
    {paths.slice(0, PREVIEW_FILES).map(path => <button key={path} type="button" onClick={onOpen}>
      <span className="chat-ellipsis">{path}</span></button>)}
    {paths.length > PREVIEW_FILES && <button type="button" onClick={onOpen}>
      {t("client.chat.showMoreFiles", { count: paths.length - PREVIEW_FILES })}</button>}
  </div>;
}
