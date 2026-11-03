import { Tooltip } from 'antd';
import { GitBranch, GitFork } from 'lucide-react';
import { uiText } from '../../i18n/uiText';
import { useConversationWorkspace } from '../../../../../shared/chat/useConversationWorkspace';
import { gitApi, type GitWorkspaceClient } from './gitApi';
import { folderName } from './projectCatalog';
import styles from './ConversationWorkspaceStatus.module.less';

export function ConversationWorkspaceStatus({ cwd, enabled, request = gitApi.request }: {
  cwd: string; enabled: boolean; request?: GitWorkspaceClient;
}) {
  const snapshot = useConversationWorkspace({ cwd, enabled, request });
  const status = enabled ? snapshot.status : undefined;
  if (!cwd) return null;
  const unavailable = snapshot.loading ? uiText('client.conversationWorkspace.loading')
    : uiText('client.conversationWorkspace.unavailable');
  const worktree = status ? (status.isWorktree
    ? uiText('client.conversationWorkspace.linkedWorktree', { name: folderName(status.cwd) })
    : uiText('client.conversationWorkspace.mainWorktree')) : unavailable;
  const branch = status ? status.branch ?? uiText('client.git.detachedHead') : unavailable;
  const fields = [
    { label: uiText('client.conversationWorkspace.currentWorktree'), value: worktree,
      detail: cwd, Icon: GitFork },
    { label: uiText('client.git.currentBranch'), value: branch, detail: branch, Icon: GitBranch },
  ];
  return <div className={styles.status} data-conversation-workspace>
    {fields.map(({ label, value, detail, Icon }) => <Tooltip key={label} trigger={['hover', 'focus']}
      title={<>{label}<br />{detail}</>}
      styles={{ root: { maxWidth: 'min(400px, calc(100vw - 24px))' }, body: { overflowWrap: 'anywhere' } }}>
      <span className={styles.item} role="group" aria-label={label} tabIndex={0}>
        <Icon size={15} aria-hidden="true" /><span>{value}</span>
      </span>
    </Tooltip>)}
  </div>;
}
