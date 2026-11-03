const INTERACTIVE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), '
  + 'video, audio, canvas, img, [role="slider"], [role="switch"]';
const OVERLAY = '[role="dialog"], [role="menu"], .adm-popup, .ant-modal, .ant-drawer';

export function swipeSurface(target: EventTarget | null, selector: string, allowButtons = false) {
  if (!(target instanceof Element)) return null;
  const surface = target.closest(selector);
  if (!surface || target.closest(allowButtons ? INTERACTIVE : `${INTERACTIVE}, button, a`)) return null;
  if (target.closest(OVERLAY) && !surface.matches('.chat-drawer')) return null;
  // Horizontal content owns its gesture even when it is already scrolled to an edge.
  for (let node: Element | null = target; node && node !== surface; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return null;
  }
  return surface;
}
