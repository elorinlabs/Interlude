import { ChevronDown, ChevronRight, Pin } from 'lucide-react';
import { useThreadLongPress } from '../../../../shared/chat/useThreadLongPress';
import type { ChatProject } from './types';
import { t } from '../i18n';

export function ChatProjectHeading({ project, collapsed, pinned, mobile, toggle, openActions }: {
  project: ChatProject; collapsed: boolean; pinned: boolean; mobile: boolean;
  toggle: () => void; openActions: () => void;
}) {
  const canManage = mobile && !!project.cwd;
  const gestures = useThreadLongPress(openActions, { enabled: canManage });
  return <h3 className="chat-grow">
    <button type="button" className="chat-project-toggle" aria-expanded={!collapsed}
      aria-label={`${collapsed ? t('client.chat.expandProject') : t('client.chat.collapseProject')}：${project.label}`}
      aria-haspopup={canManage ? 'dialog' : undefined} {...(canManage ? gestures : {})} onClick={toggle}>
      {collapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      <span className="chat-ellipsis">{project.label}</span>
      {pinned && <Pin size={12} aria-label={t('client.workspaceActions.pinned')} />}
    </button>
  </h3>;
}
