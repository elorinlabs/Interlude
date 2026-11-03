import { useMemo, type CSSProperties } from 'react';
import { gitGraph, GRAPH_ROW_HEIGHT } from '../../../../../shared/remote-chat/gitGraph';
import { GIT_HISTORY_CONTENT_WIDTH, GIT_HISTORY_DATE_FORMAT } from '../../../../../shared/remote-chat/gitHistoryLayout';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { t, getLocale } from '../../i18n';
import { useGitHistoryScroll } from './useGitHistoryScroll';
import { GitCommitMenu } from './GitCommitMenu';
import type { GitCommit } from '../../../../../shared/remote-chat/gitTypes';
import './gitHistory.css';

const HISTORY_STYLE = { '--git-history-compact-width': `${GIT_HISTORY_CONTENT_WIDTH}px`,
  '--git-history-compact-height': `${GRAPH_ROW_HEIGHT}px` } as CSSProperties;

export function GitHistory({ panel, connected, onPatch }: {
  panel: RemoteGit; connected: boolean; onPatch?: (commit: GitCommit) => Promise<void>;
}) {
  const graph = useMemo(() => gitGraph(panel.commits), [panel.commits]);
  const pagination = useGitHistoryScroll(panel, connected);
  return <div className="git-history" style={HISTORY_STYLE} ref={pagination.list} onScroll={pagination.onScroll}>
    {panel.changes && !panel.busy && !panel.commits.length &&
      <p className="git-notice">{t("client.git.noCommitsYet")}</p>}
    {graph.rows.map(row => <GitCommitMenu key={row.commit.hash} commit={row.commit} panel={panel}
      connected={connected} onPatch={onPatch}><button type="button" className="git-history-row"
      style={{ minWidth: `calc(${row.width}px + var(--git-history-content-width, 560px))` }}
      disabled={!connected || panel.busy} onClick={() => panel.setDetail({ kind: 'files', commit: row.commit })}>
      <svg className="git-history-graph" width={row.width} aria-hidden="true">
        {row.lines.map((line, index) => <line key={index} x1={line.x1} x2={line.x2}
          y1={`${line.y1 / GRAPH_ROW_HEIGHT * 100}%`} y2={`${line.y2 / GRAPH_ROW_HEIGHT * 100}%`}
          stroke={line.color} strokeWidth="1.5" />)}
        <circle cx={row.x} cy="50%" r="4" fill={row.color}
          stroke="var(--git-surface, white)" strokeWidth="1.5" />
      </svg>
      <span className="git-history-text">
        <span className="git-history-summary"><strong>{row.commit.subject}</strong>
          <span className="git-refs">{row.commit.refs.map(ref => <em key={ref}>{ref}</em>)}</span>
        </span>
        <small className="git-history-hash">{row.commit.hash.slice(0, 8)}</small>
        <small className="git-history-author">{row.commit.author}</small>
        <time dateTime={row.commit.date}>{
          new Date(row.commit.date).toLocaleString(getLocale(), GIT_HISTORY_DATE_FORMAT)}</time>
      </span>
    </button></GitCommitMenu>)}
    <div ref={pagination.end} className="git-history-end">
      {panel.hasMore && pagination.loadingMore && <span role="status">{t("client.projectBrowser.loading")}</span>}
      {panel.hasMore && pagination.failed && <button type="button" className="git-more"
        disabled={panel.busy || !connected} onClick={pagination.retry}>{t("client.terminal.retry")}</button>}
    </div>
  </div>;
}
