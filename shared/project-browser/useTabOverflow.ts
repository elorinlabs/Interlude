import { useLayoutEffect, useRef, useState } from 'react';
import { revealTabOffset, tabOverflow } from '../tabs/overflow';

interface OverflowState { overflowing: boolean; hiddenPaths: string[]; clippedLeft: boolean }

function revealTab(viewport: HTMLDivElement, path?: string) {
  const active = [...viewport.querySelectorAll<HTMLElement>('[data-overflow-tab]')]
    .find(tab => path ? tab.dataset.path === path : tab.dataset.active === 'true');
  if (!active || !viewport.clientWidth) return;
  const bounds = viewport.getBoundingClientRect();
  const tab = active.getBoundingClientRect();
  viewport.scrollLeft = revealTabOffset({ id: path ?? '', width: tab.width,
    left: tab.left - bounds.left + viewport.scrollLeft }, viewport.clientWidth, viewport.scrollLeft);
}

function measureOverflow(bar: HTMLDivElement, viewport: HTMLDivElement): OverflowState {
  const tabs = [...viewport.querySelectorAll<HTMLElement>('[data-overflow-tab]')];
  const bounds = viewport.getBoundingClientRect();
  const gap = Number.parseFloat(getComputedStyle(viewport).columnGap) || 0;
  const totalWidth = tabs.reduce((width, tab) => width + tab.getBoundingClientRect().width, 0)
    + gap * Math.max(0, tabs.length - 1);
  // Include the menu button's space so it disappears as soon as the tabs can fit without it.
  const result = tabOverflow({ tabs: tabs.map(tab => ({ id: tab.dataset.path ?? '',
    left: tab.getBoundingClientRect().left - bounds.left + viewport.scrollLeft,
    width: tab.getBoundingClientRect().width })), contentWidth: totalWidth,
    barWidth: bar.clientWidth, viewportWidth: viewport.clientWidth, scrollLeft: viewport.scrollLeft });
  return { ...result, hiddenPaths: result.hiddenIds };
}

export function useTabOverflow(tabs: { path: string }[], activePath?: string) {
  const bar = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<OverflowState>({ overflowing: false, hiddenPaths: [], clippedLeft: false });
  const paths = JSON.stringify(tabs.map(tab => tab.path));
  useLayoutEffect(() => {
    const container = bar.current, strip = viewport.current;
    if (!container || !strip) return;
    const measure = () => {
      const next = measureOverflow(container, strip);
      setState(previous => previous.overflowing === next.overflowing && previous.clippedLeft === next.clippedLeft
        && JSON.stringify(previous.hiddenPaths) === JSON.stringify(next.hiddenPaths) ? previous : next);
    };
    const resize = () => { revealTab(strip); measure(); };
    resize();
    const observer = new ResizeObserver(resize);
    [container, strip, ...strip.children].forEach(element => observer.observe(element));
    strip.addEventListener('scroll', measure, { passive: true });
    return () => { observer.disconnect(); strip.removeEventListener('scroll', measure); };
  }, [paths, activePath]);
  const reveal = (path: string) => { if (viewport.current) revealTab(viewport.current, path); };
  return { bar, viewport, reveal, ...state };
}
