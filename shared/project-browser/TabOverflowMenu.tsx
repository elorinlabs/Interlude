import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { isDirty, type DocumentTab } from './documents';
import type { BrowserTranslate } from './ProjectTree';
import { focusFirstMenuItem, MENU_MARGIN, moveMenuFocus } from './treeMenuNavigation';

interface Props {
  tabs: DocumentTab[]; anchor: HTMLButtonElement; choose: (path: string) => void;
  close: () => void; closeTab: (path: string) => void; blocked: boolean; t: BrowserTranslate;
}

function OverflowItem({ tab, choose, closeTab, blocked, t }: {
  tab: DocumentTab; choose: () => void; closeTab: () => void; blocked: boolean; t: BrowserTranslate;
}) {
  const name = tab.path.split(/[\\/]/).at(-1) ?? tab.path;
  return <div className="pf-tab-overflow-item" role="none">
    <button type="button" role="menuitem" className="pf-tab-overflow-select" aria-label={name} onClick={choose}>
      <span className="pf-tab-overflow-label">{name}</span>
      {isDirty(tab) && <span className="pf-dirty-dot" aria-label={t("client.projectBrowser.unsaved")} />}
    </button>
    <button type="button" role="menuitem" className="pf-tab-overflow-close"
      aria-label={`${t("client.projectBrowser.closeFile")} ${name}`} disabled={tab.saving || blocked} onClick={closeTab}>
      <X size={14} aria-hidden="true" />
    </button>
  </div>;
}

export function TabOverflowMenu({ tabs, anchor, choose, close, closeTab, blocked, t }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const selected = useRef(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const bounds = menu.current?.getBoundingClientRect();
    if (!bounds) return;
    const trigger = anchor.getBoundingClientRect();
    setPosition({
      left: Math.max(MENU_MARGIN, Math.min(trigger.right - bounds.width,
        window.innerWidth - bounds.width - MENU_MARGIN)),
      top: Math.max(MENU_MARGIN, Math.min(trigger.bottom, window.innerHeight - bounds.height - MENU_MARGIN)),
    });
    focusFirstMenuItem(menu.current);
  }, [anchor]);
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
      if (!selected.current && anchor.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchor, close]);
  return <div className="pf-menu-backdrop" onClick={event => {
    if (event.target === event.currentTarget) { event.stopPropagation(); close(); }
  }} onContextMenu={event => { event.preventDefault(); close(); }}>
    <div ref={menu} className="pf-tree-menu pf-tab-overflow-menu" role="menu" aria-label={t("client.projectBrowser.hiddenTabs")}
      style={position} onKeyDown={moveMenuFocus}>
      {tabs.map(tab => <OverflowItem key={tab.path} tab={tab} blocked={blocked} t={t}
        choose={() => { selected.current = true; close(); choose(tab.path); }}
        closeTab={() => { close(); closeTab(tab.path); }} />)}
    </div>
  </div>;
}
