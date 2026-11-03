import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { GIT_ACTIONS } from '../../../../../shared/remote-chat/gitActions';
import type { GitAction } from '../../../../../shared/remote-chat/gitTypes';
import { displayText, t } from '../../i18n';

interface MenuProps {
  panel: RemoteGit;
  disabled: boolean;
  onClose: () => void;
}

export function GitBranchMenu({ panel, disabled, onClose, query, onQueryChange }: MenuProps & {
  query: string; onQueryChange: (query: string) => void;
}) {
  const branch = panel.changes?.branch ?? t('client.git.detachedHead');
  const selection = panel.repository?.upstream ? `${branch} → ${panel.repository.upstream}` : branch;
  return <div className="git-menu" role="region" aria-label={t('client.git.switchBranch')}>
    <div className="git-menu-heading"><strong>{t('client.git.switchBranch')}</strong></div>
    <input aria-label={t('client.git.searchBranches')} placeholder={t('client.git.searchBranches')} value={query}
      onChange={event => onQueryChange(event.target.value)} />
    <div className="git-branch-list">{panel.repository?.branches.filter(item => item.name.includes(query))
      .map(item => <button key={item.ref} type="button"
        disabled={disabled || item.occupied || (!item.remote && item.name === panel.changes?.branch)}
        onClick={() => { onClose(); void panel.action('switch', item.ref); }}>
        <span>{item.name}</span><small>{t(item.occupied ? 'client.git.usedByAnotherWorktree'
          : item.remote ? 'client.git.remote' : 'client.git.local')}
          {!item.remote && item.name === panel.changes?.branch ? ' ✓' : ''}</small></button>)}</div>
    <p className="git-current-branch">{t('client.git.currentSelection', { branch: selection })}</p>
  </div>;
}

export function GitSyncMenu({ panel, disabled, onClose, action }: MenuProps & {
  action: Exclude<GitAction, 'switch'>;
}) {
  const repository = panel.repository;
  const item = GIT_ACTIONS.find(item => item.action === action)!;
  const requiresCleanWorkspace = action === 'pull' || action === 'update';
  return <div className="git-menu" role="region" aria-label={t('client.git.syncProject')}>
    <div className="git-menu-heading"><strong>{t('client.git.syncProject')}</strong></div>
    <strong>{displayText(item.label)}</strong>
    <p>{displayText(item.hint)}</p>
    <p>{t('client.git.currentBranch')}：{panel.changes?.branch ?? 'HEAD'}<br />
      {t('client.git.trackedBranch')}：{repository?.upstream ?? t('client.accounts.notSet')}</p>
    {action === 'pull' && <label className="git-strategy">{t('client.git.updateMethod')}
      <select aria-label={t('client.git.updateMethod')} value={panel.strategy}
        onChange={event => panel.setStrategy(event.target.value === 'rebase' ? 'rebase' : 'merge')}>
        <option value="merge">{t('client.git.merge')}</option><option value="rebase">{t('client.git.rebase')}</option>
      </select></label>}
    {requiresCleanWorkspace && !!panel.changes?.files.length
      && <p>{t('client.git.commitLocalChangesBeforePullingOrUpdatingTheProject')}</p>}
    {!repository?.remotes.length && <p>{t('client.git.addARemoteRepositoryOnYourComputerFirst')}</p>}
    <button type="button" className="git-submit" disabled={disabled || !repository?.remotes.length
      || (action !== 'fetch' && !repository.upstream)
      || (requiresCleanWorkspace && !!panel.changes?.files.length)}
      onClick={() => { onClose(); void panel.action(action); }}>
      {t('client.git.run', { action: displayText(item.label) })}</button>
  </div>;
}
