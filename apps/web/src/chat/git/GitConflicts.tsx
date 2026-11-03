import { Button } from 'antd';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { t } from '../../i18n';
import { GitConflictEditor } from './GitConflictEditor';

export function GitConflicts({ panel, connected }: { panel: RemoteGit; connected: boolean }) {
  const conflicts = panel.changes?.files.filter(file => file.conflict) ?? [];
  const integration = panel.changes?.integration;
  const disabled = panel.busy || !connected;
  return <>
    {(conflicts.length > 0 || integration) && <div className="git-conflict-banner">
      <p>{t(conflicts.length ? 'client.gitConflict.banner' : 'client.gitConflict.ready', { count: conflicts.length })}</p>
      {conflicts.length ? <Button disabled={disabled} onClick={() => void panel.openConflict(conflicts[0].path)}>
        {t('client.gitConflict.resolve')}</Button> : <Button type="primary" disabled={disabled}
        onClick={() => void panel.continueIntegration()}>
        {t(integration?.kind === 'rebase' ? 'client.gitConflict.continueRebase' : 'client.gitConflict.continue')}</Button>}
    </div>}
    {panel.conflictPath && <GitConflictEditor panel={panel} connected={connected} />}
  </>;
}
