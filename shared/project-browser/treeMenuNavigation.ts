import type { KeyboardEvent } from 'react';

export const MENU_MARGIN = 8;
export const SUBMENU_GAP = 4;

export function focusFirstMenuItem(menu: HTMLElement | null) {
  menu?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
}

export function moveMenuFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  const menu = event.currentTarget;
  const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    .filter(button => button.closest('[role="menu"]') === menu);
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const backwards = event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
    : (index + (backwards ? -1 : 1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
}
