import { useState } from 'react';

export function useDesktopLauncher() {
  const [opened, setOpened] = useState(false);
  const [minimized, setMinimized] = useState(false);
  return { opened, minimized, setMinimized,
    open: () => { setOpened(true); setMinimized(false); },
    close: () => { setOpened(false); setMinimized(false); } };
}
