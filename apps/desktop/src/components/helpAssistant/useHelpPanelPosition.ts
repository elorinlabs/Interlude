import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import { PANEL_GAP, VIEWPORT_MARGIN, type LauncherPosition } from './launcherPosition';

interface Options {
  open: boolean;
  position?: LauncherPosition;
  trigger: RefObject<HTMLButtonElement>;
  panel: RefObject<HTMLElement>;
}

export function useHelpPanelPosition({ open, position, trigger, panel }: Options) {
  const [style, setStyle] = useState<CSSProperties>();
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (!trigger.current || !panel.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const width = panel.current.getBoundingClientRect().width;
      const above = Math.max(0, anchor.top - PANEL_GAP - VIEWPORT_MARGIN);
      const below = Math.max(0, window.innerHeight - anchor.bottom - PANEL_GAP - VIEWPORT_MARGIN);
      const placeAbove = above >= below;
      setStyle({
        position: 'fixed', right: 'auto',
        left: Math.max(VIEWPORT_MARGIN, Math.min(anchor.right - width, window.innerWidth - width - VIEWPORT_MARGIN)),
        top: placeAbove ? 'auto' : anchor.bottom + PANEL_GAP,
        bottom: placeAbove ? window.innerHeight - anchor.top + PANEL_GAP : 'auto',
        maxHeight: placeAbove ? above : below,
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open, position, trigger, panel]);
  return style;
}
