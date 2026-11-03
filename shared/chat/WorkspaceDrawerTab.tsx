import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspaceDrawerTab, type WorkspaceTab } from './workspaceDrawer';
import './workspaceDrawer.css';

export function WorkspaceDrawerTab({ tab, active, autoOpen, children, className = '', style, onVisibilityChange }: {
  tab: WorkspaceTab; active: boolean; children: (visible: boolean) => ReactNode;
  className?: string; style?: CSSProperties; onVisibilityChange?: (visible: boolean) => void; autoOpen?: boolean;
}) {
  const drawer = useWorkspaceDrawerTab({ tab, active, autoOpen });
  useEffect(() => { onVisibilityChange?.(drawer.visible); }, [drawer.visible, onVisibilityChange]);
  if (!drawer.host) return null;
  return createPortal(<section role="tabpanel" aria-label={tab.title} hidden={!drawer.selected}
    className={`workspace-drawer-tab-panel ${className}`} style={style} onKeyDown={event => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); drawer.hide?.(); }
    }}>
    {children(drawer.visible)}
  </section>, drawer.host);
}
