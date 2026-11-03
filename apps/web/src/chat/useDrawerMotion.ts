import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { chatDrawerWidth, createDrawerMotion } from '../../../../shared/navigation/drawerMotion';
import { createDrawerAnimation } from './drawerAnimation';

export interface DrawerMotionView {
  visible: boolean;
  rootClassName: string;
  rootStyle: CSSProperties;
}

export function useDrawerMotion({ open, onOpenChange }: {
  open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const id = useId().replace(/:/g, '');
  const rootClassName = `chat-drawer-motion-${id}`;
  const [width, setWidth] = useState(() => chatDrawerWidth(window.innerWidth));
  const [visible, setVisible] = useState(open);
  const committed = useRef(open);
  const offset = useRef(open ? width : 0);
  const change = useRef(onOpenChange);
  change.current = onOpenChange;
  const animation = useMemo(() => createDrawerAnimation(`.${rootClassName}`, offset, width), [rootClassName, width]);
  const motion = useMemo(() => createDrawerMotion({ width, initiallyOpen: committed.current, animation,
    onStart: () => setVisible(true),
    onSettled: next => { committed.current = next; setVisible(next); change.current(next); },
  }), [width, animation]);
  useLayoutEffect(() => {
    animation.setOffset(committed.current ? width : 0);
    setVisible(committed.current);
    return motion.dispose;
  }, [motion, animation, width]);
  useEffect(() => {
    const resize = () => setWidth(chatDrawerWidth(window.innerWidth));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    if (open) motion.open();
    else motion.close();
  }, [open, motion]);
  const view: DrawerMotionView = { visible, rootClassName: `chat-drawer-motion ${rootClassName}`,
    rootStyle: { '--chat-drawer-offset': `${offset.current}px`,
      '--chat-drawer-progress': offset.current / width } as CSSProperties };
  return { motion, view };
}
