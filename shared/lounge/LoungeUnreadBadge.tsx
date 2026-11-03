import './notificationSettings.css';

export function LoungeUnreadBadge({ count = 0 }: { count?: number }) {
  return count > 0 ? <span className="lounge-avatar-unread">{count > 99 ? '99+' : count}</span> : null;
}
