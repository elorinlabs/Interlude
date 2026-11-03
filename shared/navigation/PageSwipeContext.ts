import { createContext, useContext } from 'react';
import type { PrimaryPage, SwipeProgress } from './pageSwipe';

export const PageSwipeContext = createContext<(SwipeProgress & { onNext: () => void }) | undefined>(undefined);
export const PagePreviewContext = createContext<PrimaryPage | undefined>(undefined);

// Read shared contexts with the same React types that created them (web 18 / native 19).
export const usePageSwipe = () => useContext(PageSwipeContext);
export const usePagePreview = () => useContext(PagePreviewContext);
