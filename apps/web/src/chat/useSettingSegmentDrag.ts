import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { isSettingDrag, settingSegmentAt } from '../../../../shared/remote-chat/settingSegments';

export function useSettingSegmentDrag(count: number, select: (index: number) => void) {
  const [preview, setPreview] = useState<number | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const indexAt = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return settingSegmentAt(event.clientX - bounds.left, bounds.width, count);
  };
  const cancel = () => { drag.current = null; setPreview(null); };
  return {
    preview,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (!event.isPrimary || event.button !== 0 || count < 2) return cancel();
        suppressClick.current = false;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, active: false };
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        if (!current.active && !isSettingDrag(event.clientX - current.x, event.clientY - current.y)) return;
        current.active = true;
        suppressClick.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setPreview(indexAt(event));
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        if (drag.current?.id !== event.pointerId) return;
        const index = drag.current.active ? indexAt(event) : null;
        cancel();
        if (index !== null) select(index);
      },
      onPointerCancel: cancel,
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => {
        // Touch starts with implicit capture on the button; transferring it to the track is not cancellation.
        if (event.target === event.currentTarget) cancel();
      },
      onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
        if (!suppressClick.current || event.detail === 0) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      },
    },
  };
}
