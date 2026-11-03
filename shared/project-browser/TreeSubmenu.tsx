import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { focusFirstMenuItem, MENU_MARGIN, moveMenuFocus, SUBMENU_GAP } from './treeMenuNavigation';

const CLOSE_DELAY_MS = 180;

export function TreeSubmenu({ label, icon: Icon, active, compact, open, close, children }: {
  label: string; icon: LucideIcon; active: boolean; compact: boolean;
  open: () => void; close: () => void; children: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const focusOnOpen = useRef(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const cancelClose = () => { clearTimeout(timer.current); timer.current = undefined; };
  useEffect(() => cancelClose, []);
  useLayoutEffect(() => {
    if (!active || compact) return;
    const anchor = trigger.current?.getBoundingClientRect();
    const parent = trigger.current?.closest('[role="menu"]')?.getBoundingClientRect();
    const rect = popup.current?.getBoundingClientRect();
    if (!anchor || !parent || !rect) return;
    const right = parent.right + SUBMENU_GAP;
    const left = right + rect.width <= window.innerWidth - MENU_MARGIN
      ? right : parent.left - rect.width - SUBMENU_GAP;
    setPosition({
      left: Math.max(MENU_MARGIN, Math.min(left, window.innerWidth - rect.width - MENU_MARGIN)),
      top: Math.max(MENU_MARGIN, Math.min(anchor.top, window.innerHeight - rect.height - MENU_MARGIN)),
    });
    if (focusOnOpen.current) { focusFirstMenuItem(popup.current); focusOnOpen.current = false; }
  }, [active, compact]);
  const show = (focus: boolean) => {
    cancelClose();
    focusOnOpen.current = focus && !popup.current;
    open();
    if (focus) focusFirstMenuItem(popup.current);
  };
  const returnToTrigger = () => { cancelClose(); close(); trigger.current?.focus(); };
  return <div role="none" onPointerEnter={event => {
    if (event.pointerType === 'mouse' && !compact) show(false);
  }} onPointerLeave={event => {
    if (event.pointerType !== 'mouse' || compact) return;
    cancelClose(); timer.current = setTimeout(close, CLOSE_DELAY_MS);
  }}>
    <button ref={trigger} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={active}
      aria-controls={active && !compact ? id : undefined} onClick={() => show(true)} onKeyDown={event => {
        if (event.key !== 'ArrowRight') return;
        event.preventDefault(); event.stopPropagation(); show(true);
      }}>
      <Icon size={16} /><span>{label}</span><ChevronRight size={14} />
    </button>
    {active && !compact && <div ref={popup} id={id} role="menu" aria-label={label}
      className="pf-tree-menu pf-tree-submenu" style={position} onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'ArrowLeft') {
          event.preventDefault(); event.stopPropagation(); returnToTrigger(); return;
        }
        moveMenuFocus(event);
      }}>{children}</div>}
  </div>;
}
