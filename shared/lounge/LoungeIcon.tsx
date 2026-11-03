import { MessagesSquare } from 'lucide-react';
import './lounge.css';

export function LoungeIcon({ unread = 0 }: { unread?: number }) {
  return <span className="lounge-nav-icon"><MessagesSquare size={19} />
    {unread > 0 && <span className="lounge-nav-badge">{unread > 99 ? '99+' : unread}</span>}
  </span>;
}
