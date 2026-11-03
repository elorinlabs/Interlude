import { useState, type RefObject } from 'react';
import { Dropdown } from 'antd';
import { EyeOff } from 'lucide-react';
import type { HelpCopy } from './copy';
import type { useHelpLauncherPosition } from './useHelpLauncherPosition';
import assistantIcon from './assistant-icon.jpg';
import styles from './helpAssistant.module.less';

interface Props {
  copy: HelpCopy;
  open: boolean;
  unread: boolean;
  trigger: RefObject<HTMLButtonElement>;
  placement: ReturnType<typeof useHelpLauncherPosition>;
  onToggle: () => void;
  onHide: () => void;
}

export function HelpLauncher({ copy, open, unread, trigger, placement, onToggle, onHide }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <Dropdown trigger={['contextMenu']} open={menuOpen} onOpenChange={setMenuOpen}
    autoFocus overlayClassName={styles.launcherMenu}
    menu={{ items: [{ key: 'hide', label: copy.hide, icon: <EyeOff size={15} /> }],
      onClick: () => { setMenuOpen(false); onHide(); } }}>
    <button ref={trigger} type="button" className={styles.launcher} aria-label={open ? copy.close : copy.title}
      aria-expanded={open} aria-controls="remote-ai-help"
      data-dragging={placement.dragging || undefined} {...placement.handlers}
      onDragStart={(event) => event.preventDefault()}
      onClick={(event) => {
        if (event.detail > 0 && placement.consumeDragClick()) { event.preventDefault(); return; }
        setMenuOpen(false); onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
        event.preventDefault(); setMenuOpen(true);
      }}>
      <img src={assistantIcon} alt="" draggable={false} />
      {unread && !open && <span className={styles.unread} role="status" aria-label={copy.unread} />}
      {!open && !menuOpen && !placement.dragging && <span className={styles.tooltip}
        data-side={placement.position && placement.position.x < window.innerWidth / 2 ? 'right' : 'left'}>
        {copy.title}</span>}
    </button>
  </Dropdown>;
}
