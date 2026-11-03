import { SWIPE_SETTLE_MS } from '../../../../shared/navigation/pageSwipe';
import type { PageAnimation } from '../../../../shared/navigation/usePageTransition';

/** Let the compositor finish the transition while streamed messages occupy the main thread. */
export function createDrawerAnimation(selector: string, offset: { current: number }, width: number): PageAnimation {
  let frame = 0;
  let animations: Animation[] = [];
  const elements = () => {
    const root = document.querySelector<HTMLElement>(selector);
    return { panel: root?.querySelector<HTMLElement>('.ant-drawer-content-wrapper'),
      mask: root?.querySelector<HTMLElement>('.ant-drawer-mask') };
  };
  const transform = (value: number) => `translate3d(${value - width}px, 0, 0)`;
  const setOffset = (value: number) => {
    offset.current = value;
    const { panel, mask } = elements();
    if (panel) panel.style.transform = transform(value);
    if (mask) mask.style.opacity = String(value / width);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    const { panel } = elements();
    if (animations.length && panel) setOffset(panel.getBoundingClientRect().right);
    animations.forEach(animation => { animation.onfinish = null; animation.cancel(); });
    animations = [];
  };
  const animate = (target: number, complete: () => void) => {
    stop();
    // Opening mounts the portal; wait for its first layout before starting the compositor animation.
    frame = requestAnimationFrame(() => {
      const { panel, mask } = elements();
      if (!panel) { setOffset(target); complete(); return; }
      const start = offset.current;
      setOffset(target);
      const timing = { duration: SWIPE_SETTLE_MS, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' };
      const slide = panel.animate([{ transform: transform(start) }, { transform: transform(target) }], timing);
      animations = [slide];
      if (mask) animations.push(mask.animate([{ opacity: start / width }, { opacity: target / width }], timing));
      slide.onfinish = () => { animations = []; complete(); };
    });
  };
  return { stop, setOffset, animate };
}
