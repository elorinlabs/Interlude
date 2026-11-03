import { displayError } from '../../i18n/index';
import { Spin } from 'antd';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { GitCommit, GitCommitFile } from '../../../../../shared/remote-chat/gitTypes';
import type { CommitFilesState } from '../../../../../shared/remote-chat/useGitCommitFiles';
import { commitFileStatus } from '../../../../../shared/remote-chat/gitCommitFiles';
import { gitCommitColors } from './gitTheme';
import fileIcon from '../../../../../shared/remote-chat/assets/git-icons/file-v2.png';
import { getLocale, t } from '../../i18n';

interface Props {
  commit: GitCommit; state: CommitFilesState; connected: boolean;
  onSelect: (file: GitCommitFile) => void; onBack: () => void;
}

export function GitCommitFiles({ commit, state, connected, onSelect, onBack }: Props) {
  return <>
    <button type="button" className="git-detail-title" onClick={onBack}>
      <ArrowLeft size={18} /><span>{t("client.git.backToHistory")}</span></button>
    <div className="git-commit-heading"><strong>{commit.subject}</strong>
      <small>{commit.hash.slice(0, 8)} · {commit.author} · {new Date(commit.date).toLocaleString(getLocale())}</small>
      {commit.parents.length > 1 && <small>{t("client.git.changesComparedWithTheFirstParent")}</small>}
    </div>
    {state.error && <><p role="alert" className="git-error">{displayError(state.error)}</p>
      <button type="button" className="git-more" disabled={!connected} onClick={state.retry}>{t("client.terminal.retry")}</button></>}
    {!state.files && !state.error && connected && <Spin />}
    {state.files && <>
      <div className="git-detail-title">{t("client.git.changedFiles", { count: state.files.length })}</div>
      <div className="git-files git-commit-files">
        {!state.files.length && <p className="git-notice">{t("client.git.thisCommitHasNoFileChanges")}</p>}
        {state.files.map(file => {
          const status = commitFileStatus(file.status);
          const colors = gitCommitColors(file.status);
          return <button key={file.path} type="button" className="git-commit-file" disabled={!connected}
            aria-label={t("client.git.view", { path: file.path })} onClick={() => onSelect(file)}>
            <img src={fileIcon} className="git-tree-icon" alt="" />
            <span className="git-commit-file-path" style={{ color: colors.color }}>{file.path.split('/').pop()}
              {file.path.includes('/') && <small>{file.path}</small>}
              {file.originalPath && <small>{file.originalPath} → {file.path}</small>}</span>
            <span className="git-commit-status" style={colors}>
              {t(status.label)}</span><ChevronRight size={14} />
          </button>;
        })}
      </div>
    </>}
  </>;
}
