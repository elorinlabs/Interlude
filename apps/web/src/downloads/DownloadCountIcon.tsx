import type { ReactNode } from 'react';
import { useActiveDownloadCount } from '../../../../shared/downloads/useActiveDownloadCount';
import { t, useLanguage } from '../i18n';
import { downloadManager } from './manager';
import './countIcon.css';

export function DownloadCountIcon({ owners, children, target = false }: {
  owners: readonly (string | undefined)[];
  children: ReactNode;
  target?: boolean;
}) {
  useLanguage();
  const count = useActiveDownloadCount({ manager: downloadManager, owners });
  return <i className="download-count-icon" data-download-target={target || undefined}>
    {children}
    {count > 0 && <sup className="download-count-badge" role="status"
      aria-label={t('client.downloads.activeCount', { count })}>{count}</sup>}
  </i>;
}
