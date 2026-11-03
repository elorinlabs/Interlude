import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { BrowserTranslate } from './ProjectTree';
import type { GutterMenuPosition } from './useGutterMenu';
import { focusFirstMenuItem, MENU_MARGIN, moveMenuFocus } from './treeMenuNavigation';

export function GutterMenu({ position, enabled, toggle, close, t }: {
  position: GutterMenuPosition; enabled: boolean; toggle: () => void; close: () => void; t: BrowserTranslate;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState({ left: position.x, top: position.y });
  useLayoutEffect(() => {
    const rect = element.current?.getBoundingClientRect();
    if (rect) setStyle({
      left: Math.max(MENU_MARGIN, Math.min(position.x, innerWidth - rect.width - MENU_MARGIN)),
      top: Math.max(MENU_MARGIN, Math.min(position.y, innerHeight - rect.height - MENU_MARGIN)),
    });
    if (!position.touch) focusFirstMenuItem(element.current);
  }, [position]);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    document.addEventListener('keydown', dismiss, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', dismiss, true);
      window.removeEventListener('resize', close);
    };
  }, [close]);
  return <div className="pf-menu-backdrop" onPointerDown={event => {
    if (event.target === event.currentTarget) close();
  }} onContextMenu={event => event.preventDefault()}>
    <div ref={element} className="pf-tree-menu pf-blame-menu" role="menu" style={style}
      aria-label={t(enabled ? 'client.gitBlame.hideAnnotations' : 'client.gitBlame.annotate')}
      onKeyDown={moveMenuFocus}>
      <button type="button" role="menuitemcheckbox" aria-checked={enabled} onClick={toggle}>
        <Check size={16} aria-hidden="true" />
        <span>{t(enabled ? 'client.gitBlame.hideAnnotations' : 'client.gitBlame.annotate')}</span>
      </button>
    </div>
  </div>;
}
