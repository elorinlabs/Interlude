import { Compass } from 'lucide-react';
import { DownloadCountIcon } from '../downloads/DownloadCountIcon';

export function DiscoveryIcon({ owner, unread }: { owner?: string; unread: number }) {
  if (!unread) return <DownloadCountIcon owners={[owner]}><Compass size={21} /></DownloadCountIcon>;
  return <span className="lounge-nav-icon"><Compass size={21} />
    <span className="mobile-lounge-badge">{unread > 99 ? '99+' : unread}</span></span>;
}
