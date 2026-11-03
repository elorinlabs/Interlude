import { useEffect, useState } from 'react';
import { Dropdown } from 'antd';
import { Ellipsis, X } from 'lucide-react';
import { useDiffText } from './diffText';
import { useTabOverflow } from '../project-browser/useTabOverflow';
import type { WorkspaceTab } from './workspaceDrawer';
import './workspaceDrawer.css';

export function WorkspaceDrawerTabs({ tabs, selected, visible, choose, close }: {
  tabs: WorkspaceTab[]; selected: string | null; visible: boolean;
  choose: (id: string) => void; close: (id: string) => void;
}) {
  const t = useDiffText();
  const overflow = useTabOverflow(tabs.map(tab => ({ path: tab.id })), selected ?? undefined);
  const hidden = tabs.filter(tab => overflow.hiddenPaths.includes(tab.id));
  const [open, setOpen] = useState(false);
  const focusSelected = () => overflow.viewport.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
    ?.focus({ preventScroll: true });
  const select = (id: string) => {
    overflow.reveal(id); choose(id); setOpen(false); requestAnimationFrame(focusSelected);
  };
  const closeTab = (id: string) => { close(id); setOpen(false); requestAnimationFrame(focusSelected); };
  useEffect(() => { if (!visible || !hidden.length) setOpen(false); }, [visible, hidden.length]);
  useEffect(() => {
    if (visible) overflow.viewport.current?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [visible, selected]);
  return <div ref={overflow.bar} className="workspace-drawer-tabs-bar" data-clipped-left={overflow.clippedLeft}
    onKeyDown={event => {
      if (!open || event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); setOpen(false);
      event.currentTarget.querySelector<HTMLButtonElement>('.workspace-drawer-tabs-more')?.focus();
    }}>
    <div ref={overflow.viewport} className="workspace-drawer-tabs" role="tablist"
    aria-label={t('client.desktopGuiExtras.sidebarContent')}>
    {tabs.map((tab, index) => <div key={tab.id} className="workspace-drawer-tab"
      data-overflow-tab data-path={tab.id} data-active={selected === tab.id}>
      <button type="button" className="workspace-drawer-tab-select" role="tab"
        aria-selected={selected === tab.id} tabIndex={selected === tab.id ? 0 : -1}
        onClick={() => select(tab.id)} onKeyDown={event => {
          const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -index,
            End: tabs.length - index - 1 };
          if (!(event.key in offsets)) return;
          event.preventDefault();
          select(tabs[(index + offsets[event.key] + tabs.length) % tabs.length].id);
        }}>
        {tab.icon}<span>{tab.title}</span>
      </button>
      <button type="button" className="workspace-drawer-tab-close"
        aria-label={t('client.mobile.close', { value1: tab.title })} onClick={() => closeTab(tab.id)}><X size={14} /></button>
    </div>)}
    </div>
    {overflow.overflowing && <Dropdown trigger={['click']} open={open} onOpenChange={setOpen} autoFocus
      placement="bottomRight" align={{ overflow: { adjustX: true, adjustY: true, shiftX: true } }}
      getPopupContainer={trigger => trigger.parentElement ?? trigger}
      overlayClassName="workspace-drawer-tabs-menu" menu={{
        'aria-label': t('client.projectBrowser.hiddenTabs'),
        items: hidden.map(tab => ({ key: tab.id, label: <div className="workspace-drawer-tabs-menu-item">
          {tab.icon}<span>{tab.title}</span>
          <button type="button" className="workspace-drawer-tab-close"
            aria-label={t('client.mobile.close', { value1: tab.title })}
            onClick={event => { event.stopPropagation(); closeTab(tab.id); }}><X size={14} /></button>
        </div> })), onClick: ({ key }) => select(key),
      }}>
      <button type="button" className="workspace-drawer-tabs-more" aria-label={t('client.projectBrowser.moreTabs')}
        aria-haspopup="menu" aria-expanded={open}><Ellipsis size={18} /></button>
    </Dropdown>}
  </div>;
}
