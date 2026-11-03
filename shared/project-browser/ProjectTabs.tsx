import { useCallback, useEffect, useRef, useState } from 'react';
import { Ellipsis, X } from 'lucide-react';
import { Tooltip } from 'antd';
import { isDirty, type DocumentTab } from './documents';
import type { BrowserTranslate } from './ProjectTree';
import { TabMenu } from './TabMenu';
import { useTreeGesture } from './useTreeGesture';
import type { TabCommand, TabMenuTarget, TabTarget } from './tabCommands';
import { useTabOverflow } from './useTabOverflow';
import { TabOverflowMenu } from './TabOverflowMenu';

interface Props {
  tabs: DocumentTab[]; activePath?: string; choose: (path: string) => void;
  close: (path: string) => void; t: BrowserTranslate; groupId: string; blocked: boolean; connected: boolean;
  command: (target: TabTarget, command: TabCommand) => void;
}

function ProjectTab({ tab, active, choose, close, menu, navigate, blocked, t }: {
  tab: DocumentTab; active: boolean; blocked: boolean; choose: () => void; close: () => void;
  menu: (point: { x: number; y: number }) => void; navigate: (key: string) => boolean; t: BrowserTranslate;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const gesture = useTreeGesture(point => { button.current?.focus(); menu(point); });
  const name = tab.path.split(/[\\/]/).at(-1) ?? tab.path;
  return <Tooltip title={tab.path} placement="bottomLeft"
    styles={{ root: { maxWidth: 'min(400px, calc(100vw - 16px))' },
      body: { overflowWrap: 'anywhere', whiteSpace: 'normal' } }}>
    <div className="pf-tab" data-overflow-tab data-path={tab.path} data-active={active} {...gesture}>
      <button ref={button} type="button" role="tab" aria-selected={active} aria-label={name}
        aria-haspopup="menu" tabIndex={active ? 0 : -1} onClick={choose} onKeyDown={event => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            menu({ x: rect.left, y: rect.bottom }); return;
          }
          if (navigate(event.key)) event.preventDefault();
        }}>
        <span className="pf-tab-name">{name}</span>
        {isDirty(tab) && <span className="pf-dirty-dot" aria-label={t("client.projectBrowser.unsaved")} />}
      </button>
      <button type="button" className="pf-tab-close" aria-label={`${t("client.projectBrowser.closeFile")} ${name}`}
        disabled={tab.saving || blocked} onClick={close}><X size={14} /></button>
    </div>
  </Tooltip>;
}

export function ProjectTabs({ tabs, activePath, choose, close, t, groupId, blocked, connected, command }: Props) {
  const overflow = useTabOverflow(tabs, activePath);
  const [overflowAnchor, setOverflowAnchor] = useState<HTMLButtonElement>();
  const [menu, setMenu] = useState<TabMenuTarget>();
  const dismiss = useCallback(() => setMenu(undefined), []);
  const dismissOverflow = useCallback(() => setOverflowAnchor(undefined), []);
  const hiddenTabs = tabs.filter(tab => overflow.hiddenPaths.includes(tab.path));
  useEffect(() => { if (!hiddenTabs.length) dismissOverflow(); }, [hiddenTabs.length, dismissOverflow]);
  const select = (path: string) => {
    overflow.reveal(path);
    choose(path);
    const index = tabs.findIndex(tab => tab.path === path);
    overflow.viewport.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[index]?.focus({ preventScroll: true });
  };
  return <><div ref={overflow.bar} className="pf-tabs-bar" data-clipped-left={overflow.clippedLeft}>
    <div ref={overflow.viewport} className="pf-tabs" role="tablist" aria-label={t("client.projectBrowser.openFiles")}>
      {tabs.map((tab, index) => <ProjectTab key={tab.path} tab={tab} active={tab.path === activePath}
        choose={() => select(tab.path)} close={() => close(tab.path)} t={t} blocked={blocked}
        menu={point => setMenu({ ...point, groupId, path: tab.path })}
        navigate={key => {
          const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -index,
            End: tabs.length - index - 1 };
          if (!(key in offsets)) return false;
          const next = (index + offsets[key] + tabs.length) % tabs.length;
          select(tabs[next].path);
          return true;
        }} />)}
    </div>
    {overflow.overflowing && <button type="button" className="pf-tabs-more" aria-label={t("client.projectBrowser.moreTabs")}
      aria-haspopup="menu" aria-expanded={!!overflowAnchor}
      onClick={event => { dismiss(); setOverflowAnchor(event.currentTarget); }}><Ellipsis size={18} /></button>}
  </div>
    {overflowAnchor && hiddenTabs.length > 0 && <TabOverflowMenu tabs={hiddenTabs} anchor={overflowAnchor}
      choose={select} close={dismissOverflow} closeTab={close} blocked={blocked} t={t} />}
    {menu && <TabMenu target={menu} tabs={tabs} blocked={blocked} connected={connected}
      command={action => command(menu, action)} close={dismiss} t={t} />}
  </>;
}
