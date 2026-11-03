import { displayText } from '../../i18n/index';
import { useState } from 'react';
import { Popover, Tooltip, type PopoverProps } from 'antd';
import { GitBranch, ChevronDown, RefreshCw, Download, ArrowDown, ArrowUp, ArrowDownUp, Undo2 } from 'lucide-react';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { GIT_ACTIONS, gitSyncCounts } from '../../../../../shared/remote-chat/gitActions';
import type { GitAction } from '../../../../../shared/remote-chat/gitTypes';
import { GitBranchMenu, GitSyncMenu } from './GitToolbarMenu';
import { t } from '../../i18n';

const ACTION_ICONS = { fetch: Download, pull: ArrowDown, update: ArrowDownUp, push: ArrowUp };
const MENU_POPOVER_PROPS: PopoverProps = {
  trigger: 'click', arrow: false, destroyOnHidden: true,
  // Edge-aligned popovers must also shift when neither side fits inside a narrow drawer.
  align: { offset: [0, 4], overflow: { adjustX: true, adjustY: true, shiftX: true } },
  rootClassName: 'git-toolbar-popover',
  // Keep the popup within the Git drawer so it inherits the workspace theme and visibility.
  getPopupContainer: trigger => trigger.closest<HTMLElement>('.git-toolbar-container') ?? trigger,
  styles: { body: { padding: 0, background: 'transparent', boxShadow: 'none' } },
};
type ToolbarMenu = 'branches' | Exclude<GitAction, 'switch'>;

export function GitToolbar({ panel, connected }: { panel: RemoteGit; connected: boolean }) {
  const [menu, setMenu] = useState<ToolbarMenu | null>(null);
  const [query, setQuery] = useState('');
  const disabled = panel.busy || !connected || !panel.changes;
  const counts = gitSyncCounts(panel.repository);
  const close = () => setMenu(null);
  const changeMenu = (target: ToolbarMenu, open: boolean) => {
    setMenu(current => open ? target : current === target ? null : current);
  };
  return <div className="git-toolbar-container" onKeyDown={event => {
    if (event.key === 'Escape' && menu) { event.stopPropagation(); close(); }
  }}>
    <div className="git-toolbar">
      <div className="git-branch-slot">
        <Popover {...MENU_POPOVER_PROPS} placement="bottomLeft" open={menu === 'branches'}
          onOpenChange={open => changeMenu('branches', open)}
          content={<GitBranchMenu panel={panel} disabled={disabled} onClose={close}
            query={query} onQueryChange={setQuery} />}>
          <button className="git-branch" type="button" aria-label={t('client.git.switchBranch')} disabled={disabled}
            aria-expanded={menu === 'branches'}>
            <GitBranch size={16} /><span>{panel.changes?.branch ?? t('client.git.detachedHead')}</span>
            <ChevronDown size={14} />
          </button>
        </Popover>
      </div>
      <div className="git-toolbar-actions">
        {GIT_ACTIONS.map(item => {
          const Icon = ACTION_ICONS[item.action];
          const count = counts[item.action];
          const open = menu === item.action;
          return <Popover key={item.action} {...MENU_POPOVER_PROPS} placement="bottomRight" open={open}
            onOpenChange={value => changeMenu(item.action, value)}
            content={<GitSyncMenu panel={panel} disabled={disabled} onClose={close} action={item.action} />}>
            <Tooltip title={open ? null : displayText(item.label)} styles={{ root: { maxWidth: 400 } }}>
              <button type="button" aria-label={displayText(item.label)} disabled={disabled}
                className={count !== undefined ? 'git-counted-action' : undefined}
                aria-description={count !== undefined ? t('client.git.commitsToSync', { count }) : undefined}
                aria-expanded={open}><Icon size={18} />
                {count !== undefined && <span className="git-action-count" aria-hidden="true">{count}</span>}</button>
            </Tooltip>
          </Popover>;
        })}
        <Tooltip title={t('client.git.rollBackSelectedFiles')} styles={{ root: { maxWidth: 400 } }}>
          <button type="button" aria-label={t('client.git.rollBackSelectedFiles')}
            disabled={disabled || !Object.keys(panel.selected).length || panel.changes?.files.some(file => file.conflict)}
            onClick={() => { close(); panel.requestFileAction('rollback'); }}><Undo2 size={18} /></button>
        </Tooltip>
        <Tooltip title={t('client.git.refreshGit')} styles={{ root: { maxWidth: 400 } }}>
          <button type="button" aria-label={t('client.git.refreshGit')} disabled={disabled}
            onClick={() => { panel.setDetail(null); void panel.refresh(); }}><RefreshCw size={18} /></button>
        </Tooltip>
      </div>
    </div>
  </div>;
}
