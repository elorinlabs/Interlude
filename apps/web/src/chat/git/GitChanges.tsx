import { Checkbox } from 'antd';
import { ChevronDown, ChevronRight } from 'lucide-react';
import fileIcon from '../../../../../shared/remote-chat/assets/git-icons/file-v2.png';
import folderIcon from '../../../../../shared/remote-chat/assets/git-icons/folder-v2.png';
import { selectionState } from '../../../../../shared/remote-chat/gitFiles';
import type { GitFileRow } from '../../../../../shared/remote-chat/useGitFileList';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { gitAreaColors } from './gitTheme';
import { GitFileMenu } from './GitFileMenu';
import { GitCommitForm } from './GitCommitForm';
import { GitConflicts } from './GitConflicts';
import { t } from '../../i18n';

export function GitChanges({ panel, connected }: { panel: RemoteGit; connected: boolean }) {
  const files = panel.changes?.files ?? [];
  const list = panel.fileList;
  const count = Object.keys(panel.selected).length;
  const all = selectionState(files, panel.selected);
  return <>
    <GitConflicts panel={panel} connected={connected} />
    <div className="git-selection"><Checkbox disabled={panel.busy || !files.some(file => !file.conflict)}
      checked={all === true} indeterminate={all === 'mixed'} onChange={panel.selectAll}>{t("client.projectBrowser.selectAll")}</Checkbox>
      <span>{t("client.git.filesSelected", { count })}</span>
      <div className="git-view-toggle" aria-label={t("client.git.fileView")}>
        {(['tree', 'flat'] as const).map(mode => <button key={mode} type="button" aria-pressed={list.mode === mode}
          onClick={() => list.setMode(mode)}>{t(mode === 'tree' ? "client.git.folders" : "client.git.flat")}</button>)}
      </div></div>
    <div className="git-files">
      {panel.changes && !files.length && <p className="git-notice">{t("client.git.thereAreNoUncommittedChanges")}</p>}
      {list.rows.map(row => <GitRow key={row.id} row={row} panel={panel} connected={connected}
        onToggle={() => list.toggleFolder(row.id)} flat={list.mode === 'flat'} />)}
    </div>
    {!panel.changes?.integration && <GitCommitForm panel={panel} />}
  </>;
}

function GitRow({ row, panel, connected, onToggle, flat }: {
  row: GitFileRow; panel: RemoteGit; connected: boolean; onToggle: () => void; flat: boolean;
}) {
  const checked = selectionState(row.files, panel.selected);
  const folder = row.kind === 'folder';
  const area = row.kind === 'area';
  const colors = gitAreaColors(row.area.id);
  return <GitFileMenu row={row} panel={panel} connected={connected}>
    <div className={`git-file git-file-${row.kind}`} data-area={row.area.id}
    style={{ color: colors.color, background: !area && checked === true ? colors.background : undefined }}>
    <Checkbox aria-label={t("client.git.select", { path: area ? t(row.area.label) : row.path })} checked={checked === true}
      indeterminate={checked === 'mixed'} disabled={panel.busy || !row.files.some(file => !file.conflict)}
      onChange={() => panel.selectFiles(row.files)} />
    {area ? <strong><i className="git-area-dot" style={{ background: colors.color }} />
      {t(row.area.label)} <small style={{ background: colors.background }}>{row.files.length}</small></strong>
      : <button type="button" aria-label={folder ? t("client.git.expandOrCollapse", { path: row.path })
        : t("client.git.view", { path: row.path })} aria-expanded={folder ? !row.collapsed : undefined}
        disabled={panel.busy || (!folder && !connected)} title={row.path}
        style={{ marginLeft: Math.min(row.depth, 4) * 14 }}
        onClick={() => {
          if (folder) onToggle();
          else if (row.file?.conflict) void panel.openConflict(row.path);
          else panel.setDetail({ kind: 'diff', path: row.path, title: row.path });
        }}>
        {!flat && <span className="git-tree-chevron">{folder && (row.collapsed
          ? <ChevronRight size={12} /> : <ChevronDown size={12} />)}</span>}
        <img src={folder ? folderIcon : fileIcon} className="git-tree-icon" alt="" aria-hidden="true" />
        <span className="git-file-name">{row.name}
          {flat && row.path !== row.name && <small>{row.path}</small>}
          {row.file?.originalPath && <small>{row.file.originalPath} → {row.path}</small>}</span>
        <span className="git-status" style={{ background: folder ? undefined : colors.background }}>
          {folder ? row.files.length : row.file?.status.trim()}</span>
      </button>}
    {row.file?.conflict && <button type="button" className="git-conflict-entry"
      disabled={panel.busy || !connected} onClick={() => void panel.openConflict(row.path)}>
      {t('client.gitConflict.resolve')}</button>}
    </div></GitFileMenu>;
}
