import { displayText } from '../../i18n/index';
import { X } from 'lucide-react';
import type { DesktopStats as Stats } from '../../../../../shared/remote-desktop/protocol';
import { desktopStatsLines } from '../../../../../shared/remote-desktop/stats';
import { t } from '../../i18n';

export function DesktopStats({ stats, close }: { stats: Stats; close: () => void }) {
  return <div className="rd-stats">
    <span aria-label={t("client.remoteDesktop.connectionStats")}>{desktopStatsLines(stats, displayText).join('\n')}</span>
    <button aria-label={t("client.remoteDesktop.closeConnectionStats")} onClick={close}><X size={18} /></button>
  </div>;
}
