import { useRef, useState, type ReactNode } from 'react';
import { displayText as t } from '../localization/messages';

const ACTION_WIDTH = 76;
const DRAG_THRESHOLD = 12;

export function LoungeSwipeRow({ enabled, remove, children }: {
  enabled: boolean; remove: () => void; children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const drag = useRef<{ x: number; y: number; start: number; moved: boolean }>();
  const suppressClick = useRef(0);
  return <div className="lounge-swipe-row" onPointerDown={event => {
    if (enabled && event.pointerType === 'touch') drag.current = {
      x: event.clientX, y: event.clientY, start: offset, moved: false };
  }} onPointerMove={event => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.x; const dy = event.clientY - current.y;
    if (!current.moved && Math.abs(dy) > DRAG_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
      drag.current = undefined; return;
    }
    if (Math.abs(dx) > DRAG_THRESHOLD && Math.abs(dx) > Math.abs(dy)) current.moved = true;
    if (current.moved) { event.currentTarget.setPointerCapture(event.pointerId);
      setOffset(Math.max(0, Math.min(ACTION_WIDTH, current.start + dx))); }
  }} onPointerUp={() => {
    if (drag.current?.moved) { suppressClick.current = Date.now() + 400; setOffset(value => value > ACTION_WIDTH / 2
      ? ACTION_WIDTH : 0); }
    drag.current = undefined;
  }} onPointerCancel={() => { drag.current = undefined; setOffset(0); }} onClickCapture={event => {
    if (Date.now() < suppressClick.current) { event.preventDefault(); event.stopPropagation(); }
  }}>
    {enabled && offset > 0 && <button type="button" className="lounge-swipe-delete"
      onClick={() => { setOffset(0); remove(); }}>{t('client.lounge.deleteChat')}</button>}
    <div className="lounge-swipe-content" style={{ transform: `translateX(${offset}px)` }}>{children}</div>
  </div>;
}
