import { useLayoutEffect } from 'react';
import { DEFAULT_FONT_SIZE, useGlobalFontSize } from './fontSize';

export function useApplicationFontSize(): number {
  const fontSize = useGlobalFontSize();
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--app-font-scale', String(fontSize / DEFAULT_FONT_SIZE));
    return () => { root.style.removeProperty('--app-font-scale'); };
  }, [fontSize]);
  return fontSize;
}
