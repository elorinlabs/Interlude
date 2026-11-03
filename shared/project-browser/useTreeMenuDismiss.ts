import { useEffect, useRef, type RefObject } from 'react';

export function useTreeMenuDismiss(element: RefObject<HTMLDivElement>, close: () => void) {
  const pressed = useRef(false);
  useEffect(() => {
    const pointerDown = (event: PointerEvent) => {
      pressed.current = true;
      if (!element.current?.contains(event.target as Node)) close();
    };
    const click = (event: MouseEvent) => {
      // A long press opens the menu before release; its synthetic click must not activate a row or item.
      if (!pressed.current && event.detail !== 0) {
        event.preventDefault(); event.stopPropagation();
      }
      pressed.current = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || element.current?.contains(event.target as Node)) return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    // Keep the file tree reachable so the next right click can open its own menu.
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [element, close]);
}
