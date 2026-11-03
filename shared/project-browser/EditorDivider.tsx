import { useRef } from 'react';
import { frameStyle, type DividerFrame } from './editorLayout';
import type { BrowserTranslate } from './ProjectTree';

const KEYBOARD_RESIZE_STEP = 0.05;

export function EditorDivider({ divider, resize, t }: {
  divider: DividerFrame; resize: (id: string, ratio: number) => void; t: BrowserTranslate;
}) {
  const drag = useRef<{ pointer: number; origin: number; size: number; ratio: number }>();
  const { split, frame, vertical } = divider;
  const element = useRef<HTMLDivElement>(null);
  const size = () => {
    const bounds = element.current?.parentElement?.getBoundingClientRect();
    return bounds ? (vertical ? bounds.height * frame.height : bounds.width * frame.width) / 100 : 0;
  };
  const clamp = (ratio: number, available: number) => {
    if (!available || available <= divider.firstMinimum + divider.secondMinimum) return 0.5;
    return Math.max(divider.firstMinimum / available, Math.min(1 - divider.secondMinimum / available, ratio));
  };
  const position = vertical
    ? { ...frame, top: frame.top + frame.height * split.ratio, height: 0 }
    : { ...frame, left: frame.left + frame.width * split.ratio, width: 0 };
  return <div ref={element} className="pf-editor-divider" data-vertical={vertical} role="separator" tabIndex={0}
    aria-label={t("client.projectBrowser.resizeEditorPanes")} aria-orientation={vertical ? 'horizontal' : 'vertical'}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split.ratio * 100)} style={frameStyle(position)}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointer: event.pointerId, origin: vertical ? event.clientY : event.clientX,
        size: size(), ratio: split.ratio };
    }} onPointerMove={event => {
      const start = drag.current;
      if (!start || start.pointer !== event.pointerId || !start.size) return;
      const delta = (vertical ? event.clientY : event.clientX) - start.origin;
      resize(split.id, clamp(start.ratio + delta / start.size, start.size));
    }} onPointerUp={() => { drag.current = undefined; }}
    onPointerCancel={() => { drag.current = undefined; }} onLostPointerCapture={() => { drag.current = undefined; }}
    onDoubleClick={() => resize(split.id, 0.5)} onKeyDown={event => {
      const keys = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
      if (!keys.includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const step = event.key === keys[0] ? -KEYBOARD_RESIZE_STEP : KEYBOARD_RESIZE_STEP;
      resize(split.id, clamp(split.ratio + step, size()));
    }} />;
}
