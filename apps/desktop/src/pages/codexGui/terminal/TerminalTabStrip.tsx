import { useEffect, useState } from 'react';
import { Dropdown, Tooltip } from 'antd';
import { Ellipsis, SquareTerminal, X } from 'lucide-react';
import type { TerminalTab } from './useTerminalPanel';
import { useTabOverflow } from '../../../../../../shared/project-browser/useTabOverflow';
import { sshLabel } from '../../../../../../shared/terminal/sshProfiles';
import styles from './terminal.module.less';

export function TerminalTabStrip({ tabs, selected, select, remove, translate }: {
  tabs: TerminalTab[]; selected: string | null; select: (id: string) => void; remove: (id: string) => void;
  translate: (key: string, values?: { number: number }) => string;
}) {
  const overflow = useTabOverflow(tabs.map(tab => ({ path: tab.id })), selected ?? undefined);
  const hidden = tabs.filter(tab => overflow.hiddenPaths.includes(tab.id));
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!hidden.length) setOpen(false); }, [hidden.length]);
  const label = (tab: TerminalTab) => tab.session?.ssh ? sshLabel(tab.session.ssh)
    : (tab.npmScript ?? tab.session?.npmScript) ? `npm run ${tab.npmScript ?? tab.session?.npmScript}`
      : tab.cwd || `${translate('client.projectBrowser.terminal')} ${tabs.indexOf(tab) + 1}`;
  const closeLabel = (tab: TerminalTab) => translate('client.terminal.closeTab', { number: tabs.indexOf(tab) + 1 });
  const choose = (id: string) => { overflow.reveal(id); select(id); setOpen(false); };
  return <div ref={overflow.bar} className={styles.tabsBar}>
    <div ref={overflow.viewport} className={styles.tabs} role="tablist"
      aria-label={translate('client.chat.terminalTabs')}>
      {tabs.map(tab => <div key={tab.id} className={styles.tab} data-overflow-tab data-path={tab.id}
        data-active={selected === tab.id} data-selected={selected === tab.id}>
        <Tooltip title={label(tab)} styles={{ root: { maxWidth: 400 } }}>
          <button role="tab" id={`terminal-tab-${tab.id}`} aria-selected={selected === tab.id}
            aria-controls={`terminal-pane-${tab.id}`} onClick={() => choose(tab.id)}>
            <SquareTerminal size={15} /><span>{label(tab)}</span>
          </button>
        </Tooltip>
        <button type="button" aria-label={closeLabel(tab)} onClick={() => remove(tab.id)}><X size={14} /></button>
      </div>)}
    </div>
    {overflow.overflowing && <Dropdown trigger={['click']} open={open} onOpenChange={setOpen}
      overlayStyle={{ maxWidth: 'min(400px, calc(100vw - 16px))' }} menu={{
        items: hidden.map(tab => ({ key: tab.id, label: <div className={styles.overflowItem}>
          <span>{label(tab)}</span><button type="button" aria-label={closeLabel(tab)}
            onClick={event => { event.stopPropagation(); remove(tab.id); }}><X size={16} /></button>
        </div> })), onClick: ({ key }) => choose(key),
      }}>
      <button type="button" className={styles.iconButton} aria-label={translate('client.terminal.moreTabs')}
        aria-haspopup="menu" aria-expanded={open}><Ellipsis size={18} /></button>
    </Dropdown>}
  </div>;
}
