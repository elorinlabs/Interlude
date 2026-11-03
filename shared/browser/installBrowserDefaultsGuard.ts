const BROWSER_SHORTCUT_KEYS = new Set(['r', 'p']);

/** Suppress browser chrome while keeping application context menus and keyboard handlers reachable. */
export function installBrowserDefaultsGuard(enabled: () => boolean = () => true) {
  const preventContextMenu = (event: MouseEvent) => {
    if (enabled()) event.preventDefault();
  };
  const preventBrowserShortcut = (event: KeyboardEvent) => {
    if (!enabled() || event.altKey || !(event.ctrlKey || event.metaKey)) return;
    if (BROWSER_SHORTCUT_KEYS.has(event.key.toLowerCase())) event.preventDefault();
  };

  // Capture before child handlers can stop propagation; do not stop their own menu/terminal actions.
  window.addEventListener('contextmenu', preventContextMenu, true);
  window.addEventListener('keydown', preventBrowserShortcut, true);
  return () => {
    window.removeEventListener('contextmenu', preventContextMenu, true);
    window.removeEventListener('keydown', preventBrowserShortcut, true);
  };
}
