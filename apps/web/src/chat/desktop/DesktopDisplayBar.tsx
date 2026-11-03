import { displayText } from '../../i18n/index';
import { useEffect, useRef } from 'react';
import { Monitor } from 'lucide-react';
import type { DesktopDisplay } from '../../../../../shared/remote-desktop/protocol';
import { displayLabel, displayName } from '../../../../../shared/remote-desktop/displays';
import { t } from '../../i18n';
import './displayBar.css';

interface Props {
  displays: DesktopDisplay[];
  selected?: string;
  disabled: boolean;
  select: (displayId: string) => void;
  nativeWindow?: boolean;
}

export function DesktopDisplayBar({ displays, selected, disabled, select, nativeWindow }: Props) {
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selected]);
  if (!displays.length) return null;
  return <nav className="rd-display-bar" aria-label={t("client.remoteDesktop.monitor")} data-tauri-drag-region={nativeWindow || undefined}>
    {displays.map(display => <button key={display.id} type="button"
      ref={selected === display.id ? current : undefined} disabled={disabled}
      aria-pressed={selected === display.id} aria-label={displayLabel(display, displayText)}
      onClick={() => { if (display.id !== selected) select(display.id); }}>
      <Monitor size={18} aria-hidden="true" />
      <span className="rd-display-info">
        <span className="rd-display-name">{displayName(display, displayText)}</span>
        <span className="rd-display-resolution">{display.width} × {display.height}</span>
      </span>
      {display.primary && <span className="rd-display-primary">{t("client.remoteDesktop.primary")}</span>}
    </button>)}
  </nav>;
}
