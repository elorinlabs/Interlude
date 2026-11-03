import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';

const VIEWPORT_MARGIN = 8;
const POINTER_OFFSET = 20;

/** One tooltip per editor, independent of CodeMirror's recycled gutter markers. */
export const blameTooltip = ViewPlugin.fromClass(class {
  private tooltip: HTMLDivElement;
  private anchor?: HTMLElement;
  private events = new AbortController();

  constructor(private view: EditorView) {
    const document = view.dom.ownerDocument;
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'pf-blame-tooltip';
    this.tooltip.setAttribute('role', 'tooltip');
    this.tooltip.hidden = true;
    // The top layer avoids clipping and fixed-position offsets from editor containers.
    if (typeof this.tooltip.showPopover === 'function') this.tooltip.setAttribute('popover', 'manual');
    view.dom.append(this.tooltip);
    const options = { capture: true, signal: this.events.signal };
    document.addEventListener('pointerover', this.move, options);
    document.addEventListener('pointermove', this.move, options);
    document.addEventListener('pointerout', this.leave, options);
    for (const event of ['scroll', 'pointerdown', 'pointercancel', 'keydown', 'visibilitychange']) {
      document.addEventListener(event, this.hide, options);
    }
    document.defaultView?.addEventListener('blur', this.hide, options);
    document.defaultView?.addEventListener('resize', this.hide, options);
  }

  private move = (event: PointerEvent) => {
    const anchor = event.target instanceof Element ? event.target.closest<HTMLElement>('.pf-blame-label') : null;
    if (event.pointerType !== 'mouse' || event.buttons || !anchor || !this.view.dom.contains(anchor)) {
      this.hide(); return;
    }
    if (anchor === this.anchor) return;
    this.hide();
    this.anchor = anchor;
    this.tooltip.textContent = anchor.dataset.blameDetails ?? '';
    this.tooltip.hidden = false;
    this.tooltip.showPopover?.();
    this.position(event);
  };

  private position(event: PointerEvent) {
    const viewport = this.view.dom.ownerDocument.documentElement;
    this.tooltip.style.left = '0px';
    this.tooltip.style.top = '0px';
    const bounds = this.tooltip.getBoundingClientRect();
    const left = Math.max(VIEWPORT_MARGIN,
      Math.min(event.clientX, viewport.clientWidth - bounds.width - VIEWPORT_MARGIN));
    const top = Math.max(VIEWPORT_MARGIN,
      Math.min(event.clientY + POINTER_OFFSET, viewport.clientHeight - bounds.height - VIEWPORT_MARGIN));
    this.tooltip.style.left = `${left - bounds.left}px`;
    this.tooltip.style.top = `${top - bounds.top}px`;
  }

  private leave = (event: PointerEvent) => {
    if (!(event.relatedTarget instanceof Node) || !this.anchor?.contains(event.relatedTarget)) this.hide();
  };

  private hide = () => {
    if (this.tooltip.hidden) return;
    this.tooltip.hidePopover?.();
    this.tooltip.hidden = true;
    this.anchor = undefined;
  };

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.geometryChanged) this.hide();
  }

  destroy() {
    this.events.abort();
    this.hide();
    this.tooltip.remove();
  }
});
