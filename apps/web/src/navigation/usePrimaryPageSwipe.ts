import { useCallback } from 'react';
import { adjacentPage, type PrimaryPage, type SwipeProgress } from '../../../../shared/navigation/pageSwipe';
import { useDesktopLayout } from '../useDesktopLayout';
import { swipeSurface } from './swipeSurface';
import { useHorizontalSwipe } from './useHorizontalSwipe';

const surface = (target: EventTarget | null) => swipeSurface(target, '.main-content', true);

export function usePrimaryPageSwipe(page: string, onChange: (page: PrimaryPage) => void, progress?: SwipeProgress) {
  const desktop = useDesktopLayout();
  const previous = adjacentPage(page, 'right');
  const next = adjacentPage(page, 'left');
  const onLeft = useCallback(() => { if (next) onChange(next); }, [next, onChange]);
  const onRight = useCallback(() => { if (previous) onChange(previous); }, [previous, onChange]);
  useHorizontalSwipe({ enabled: !desktop && page !== 'chat' && Boolean(next || previous), surface,
    onLeft, onRight, ...progress });
}
