import { displayError } from '../../i18n/index';
import { Spin } from 'antd';
import { useContext, useState } from 'react';
import { WorkspaceDrawerContext } from '../../../../../shared/chat/workspaceDrawer';
import { useDesktopLayout } from '../../useDesktopLayout';
import type { GitClient } from '../../../../../shared/remote-chat/gitTypes';
import { parentGitDetail, useRemoteGit, type RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { useGitCommitFiles } from '../../../../../shared/remote-chat/useGitCommitFiles';
import { GitHistory } from './GitHistory';
import { GitChanges } from './GitChanges';
import { GitCommitFiles } from './GitCommitFiles';
import { GitToolbar } from './GitToolbar';
import { GitFileActionDialog } from './GitFileActionDialog';
import { GitRevisionDialog } from './GitRevisionDialog';
import { enqueueGitPatch } from '../../downloads/gitPatch';
import { GitDiff } from './GitDiff';
import { GitDrawer } from './GitDrawer';
import { ChatDetailsWorkspace } from '../ChatDetailsWorkspace';
import { t } from '../../i18n';

interface Props {
  client: GitClient; cwd: string; connected: boolean; active: boolean; onClose: () => void;
  desktopDiffs?: boolean;
}

export function ChatGit(props: Props) {
  const workspace = useContext(WorkspaceDrawerContext);
  const desktop = useDesktopLayout();
  const shared = Boolean(workspace && (desktop || props.desktopDiffs));
  const [visible, setVisible] = useState(false);
  const panel = useRemoteGit({ ...props, active: props.active && visible, refreshInterval: 1000 });
  return <GitDrawer {...props} onVisibilityChange={setVisible}>
    {active => <GitContent {...props} desktopDiffs={shared || props.desktopDiffs}
      active={active} panel={panel} shared={shared} />}</GitDrawer>;
}

function GitContent(props: Props & { panel: RemoteGit; shared: boolean }) {
  const { panel } = props;
  const diffPath = panel.detail?.kind === 'diff' ? panel.detail.path : undefined;
  const detail = props.desktopDiffs && panel.detail?.kind === 'diff' ? parentGitDetail(panel.detail) : panel.detail;
  const commitFiles = useGitCommitFiles(props.client, props.cwd, detail?.commit?.hash, props.active && props.connected);
  const content = <div className="chat-git">
      <GitToolbar panel={panel} connected={props.connected} />
      {props.active && panel.fileAction && <GitFileActionDialog panel={panel} connected={props.connected} />}
      {props.active && panel.revisionAction && <GitRevisionDialog panel={panel} connected={props.connected} />}
      {!props.cwd && <p className="git-notice">{t("client.git.chooseAProjectFirst")}</p>}
      {!props.connected && <p className="git-notice">{t("client.git.connectToYourComputerToUseGit")}</p>}
      {panel.error && <p role="alert" className="git-error">{displayError(panel.error)}</p>}
      {panel.notice && <p role="status" className="git-notice">{panel.notice.startsWith('已提交 ')
        ? t("client.git.committed", { hash: panel.notice.slice(4) }) : displayError(panel.notice)}</p>}
      {panel.busy && !panel.loading && <div className="git-loading"><Spin size="small" />{t("client.threadActions.working")}</div>}
      {panel.detail?.kind === 'diff' && <GitDiff
        key={JSON.stringify([props.cwd, panel.detail.path, panel.detail.commit?.hash])}
        client={props.client} cwd={props.cwd} detail={panel.detail} enabled={props.active && props.connected}
        version={panel.detail.commit ? undefined
          : panel.changes?.files.find(file => file.path === diffPath)?.version}
        desktop={Boolean(props.desktopDiffs)} onBack={panel.backDetail} />}
      {detail?.kind === 'files' && <GitCommitFiles commit={detail.commit} state={commitFiles}
        connected={props.connected} onBack={() => panel.setDetail(parentGitDetail(detail))}
        onSelect={file => panel.setDetail({ kind: 'diff', path: file.path, commit: detail.commit,
          title: `${file.path} · ${detail.commit.hash.slice(0, 8)}` })} />}
      {!detail && <>
        <div className="git-tabs" role="tablist" aria-label={t("client.git.gitView")}>
          <button type="button" role="tab" aria-selected={panel.tab === 'changes'}
            onClick={() => { panel.setDetail(null); panel.setTab('changes'); }}>
            {t("client.git.changes")}{panel.changes ? ` ${panel.changes.files.length}` : ''}</button>
          <button type="button" role="tab" aria-selected={panel.tab === 'history'}
            onClick={() => { panel.setDetail(null); panel.setTab('history'); }}>
            {t("client.git.history")}</button></div>
        {panel.loading && <div className="git-initial-loading" role="status" aria-live="polite">
          <Spin />
          <span>{t(panel.tab === 'changes' ? "client.git.loadingChanges" : "client.git.loadingCommitHistory")}</span>
        </div>}
        {!panel.loading && panel.tab === 'changes' && <GitChanges panel={panel} connected={props.connected} />}
        {!panel.loading && panel.tab === 'history' && <GitHistory panel={panel} connected={props.connected}
          onPatch={commit => enqueueGitPatch(props.client, props.cwd, commit.hash)} />}
      </>}
    </div>;
  if (props.shared) return content;
  return <ChatDetailsWorkspace selected={props.cwd} active={props.active} enabled={Boolean(props.desktopDiffs)}>
    {content}</ChatDetailsWorkspace>;
}
