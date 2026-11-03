import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import type { BrowserTranslate } from './ProjectTree';
import './browserFullscreen.css';

export const BrowserFullscreenContext = createContext({ active: false, toggle: () => {} });

export function BrowserFullscreenButton({ t, className = '' }: { t: BrowserTranslate; className?: string }) {
  const fullscreen = useContext(BrowserFullscreenContext);
  const label = t(fullscreen.active ? 'client.projectBrowser.exitFullscreen' : 'client.projectBrowser.enterFullscreen');
  return <button type="button" className={`pf-fullscreen-toggle ${className}`} aria-label={label}
    title={label} onMouseDown={event => event.preventDefault()}
    onClick={fullscreen.toggle}>
    {fullscreen.active ? <Minimize size={16} aria-hidden="true" /> : <Maximize size={16} aria-hidden="true" />}
  </button>;
}

export function useBrowserFullscreen(options: {
  host: RefObject<HTMLDivElement>; visible: boolean; onChange?: (active: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const active = expanded && options.visible;
  const notify = useRef(options.onChange);
  notify.current = options.onChange;
  useEffect(() => { if (!options.visible) setExpanded(false); }, [options.visible]);
  useEffect(() => { notify.current?.(active); }, [active]);
  useLayoutEffect(() => {
    const host = options.host.current;
    if (!active || !host) return;
    // The top layer escapes drawer clipping without moving or remounting the editor.
    // Older WebViews retain the fixed-position viewport layout.
    if (typeof host.showPopover !== 'function') return;
    host.setAttribute('popover', 'manual');
    host.showPopover();
    return () => { host.hidePopover(); host.removeAttribute('popover'); };
  }, [active, options.host]);
  return { active, toggle: () => setExpanded(value => !value), exit: () => setExpanded(false) };
}
