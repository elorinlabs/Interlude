import { Dropdown, type DropdownProps } from 'antd';
import { cloneElement, useCallback, useEffect, useRef } from 'react';
import type { HTMLAttributes, PointerEvent, ReactElement } from 'react';
import { GIT_LONG_PRESS_MS } from '../../../../../shared/remote-chat/gitMenu';
import './gitContextMenu.css';

const MOVE_TOLERANCE_PX = 10;

/** Dispatch the same context-menu event on touch, preserving Ant Design's viewport-aware positioning. */
export function GitContextMenu({ children, ...props }: Omit<DropdownProps, 'children' | 'trigger'> & {
  children: ReactElement<HTMLAttributes<HTMLElement>>;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const origin = useRef<{ x: number; y: number }>();
  const releaseClick = useRef<() => void>(() => {});
  const cancel = useCallback(() => {
    clearTimeout(timer.current); timer.current = undefined; origin.current = undefined;
    window.removeEventListener('scroll', cancel, true);
  }, []);
  const consumeRelease = () => {
    releaseClick.current();
    const clear = () => {
      document.removeEventListener('click', consume, true);
      document.removeEventListener('pointerdown', clear, true);
    };
    const consume = (event: MouseEvent) => {
      event.preventDefault(); event.stopImmediatePropagation(); clear();
    };
    releaseClick.current = clear;
    // The touch release may land on the newly opened menu instead of the original row.
    document.addEventListener('click', consume, true);
    document.addEventListener('pointerdown', clear, true);
  };
  useEffect(() => () => { cancel(); releaseClick.current(); }, [cancel]);
  useEffect(() => { if (props.disabled) cancel(); }, [props.disabled, cancel]);
  return <Dropdown {...props} trigger={['contextMenu']}>{cloneElement(children, {
    className: `${children.props.className ?? ''} git-context-trigger`,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      cancel(); releaseClick.current();
      if (props.disabled || event.pointerType === 'mouse' || event.button !== 0 || !event.isPrimary) return;
      const target = event.currentTarget;
      const point = { x: event.clientX, y: event.clientY };
      origin.current = point;
      window.addEventListener('scroll', cancel, true);
      timer.current = setTimeout(() => {
        consumeRelease(); cancel();
        target.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: 2,
        }));
      }, GIT_LONG_PRESS_MS);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y)
        > MOVE_TOLERANCE_PX) cancel();
    },
    onPointerUp: cancel, onPointerCancel: cancel, onPointerLeave: cancel,
    onContextMenu: () => {
      if (origin.current) consumeRelease();
      cancel();
    },
  })}</Dropdown>;
}
